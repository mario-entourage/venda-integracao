import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { getGlobalPayTransaction } from '@/server/integrations/globalpay';
import { requireAdminSimple } from '../../_require-admin-simple';
import { validateBody } from '../../_validate';

/**
 * POST /api/payments/verify-link
 *
 * Admin-only. Polls GlobalPay for the current status of a single payment link
 * and updates Firestore accordingly. Mirrors the per-link logic in /api/payments/sync
 * but targets one specific link by ID rather than scanning all pending links.
 *
 * Body: { linkId, orderId }
 *   linkId  — Firestore document ID of the payment link
 *   orderId — The associated order ID, or "" for standalone (top-level) links
 *
 * Returns: { ok, globalPayStatus, newStatus, approved, terminal }
 */

const APPROVED_STATUSES = new Set(['approved', 'paid', 'completed', 'success']);
const TERMINAL_STATUSES = new Set(['expired', 'cancelled', 'failed', 'rejected']);

const BodySchema = z.object({
  linkId: z.string().min(1),
  orderId: z.string(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  const { linkId, orderId } = body;

  try {
    const db = adminDb;
    const linkRef = orderId
      ? db.collection('orders').doc(orderId).collection('paymentLinks').doc(linkId)
      : db.collection('paymentLinks').doc(linkId);

    const linkSnap = await linkRef.get();
    if (!linkSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Link not found' }, { status: 404 });
    }

    const linkData = linkSnap.data()!;
    const gpOrderId = String(linkData.referenceId ?? '');

    if (!gpOrderId) {
      return NextResponse.json(
        { ok: false, error: 'No referenceId stored on this link — cannot query GlobalPay' },
        { status: 400 },
      );
    }

    const txData = await getGlobalPayTransaction(gpOrderId);
    const rawStatus = String(
      txData.status ?? txData.statusType ?? txData.statustype ?? '',
    ).toLowerCase().trim();

    let newStatus: string = linkData.status as string;
    let approved = false;
    let terminal = false;

    if (APPROVED_STATUSES.has(rawStatus)) {
      await linkRef.update({ status: 'paid', updatedAt: FieldValue.serverTimestamp() });
      newStatus = 'paid';
      approved = true;

      if (orderId) {
        const orderRef = db.collection('orders').doc(orderId);

        // Record the payment
        await orderRef.collection('payments').add({
          provider: 'globalpay',
          status: 'approved',
          amount: linkData.amount ?? 0,
          currency: linkData.currency ?? 'USD',
          paymentLinkId: linkId,
          paymentId: gpOrderId,
          paymentUrl: '',
          orderId,
          paymentDate: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Advance order status unless it's already in a final state
        const orderSnap = await orderRef.get();
        const currentStatus = String(orderSnap.data()?.status ?? '');
        if (!['paid', 'shipped', 'delivered'].includes(currentStatus)) {
          await orderRef.update({ status: 'paid', updatedAt: FieldValue.serverTimestamp() });
        }
      }
    } else if (TERMINAL_STATUSES.has(rawStatus)) {
      await linkRef.update({ status: rawStatus, updatedAt: FieldValue.serverTimestamp() });
      newStatus = rawStatus;
      terminal = true;
    }

    console.log(
      `[payments/verify-link] linkId=${linkId} orderId="${orderId}" gpStatus="${rawStatus}" newStatus="${newStatus}" by ${auth.email}`,
    );

    return NextResponse.json({ ok: true, globalPayStatus: rawStatus, newStatus, approved, terminal });
  } catch (err) {
    console.error('[payments/verify-link] Error:', err);
    return NextResponse.json(
      { ok: false, error: 'Verification failed', details: String(err) },
      { status: 500 },
    );
  }
}
