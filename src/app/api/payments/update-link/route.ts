import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { requireAdminSimple } from '../../_require-admin-simple';
import { validateBody } from '../../_validate';

/**
 * POST /api/payments/update-link
 *
 * Admin-only. Updates the denormalized metadata fields on a payment link.
 * Only clientName, repName, and invoice are mutable — amount, currency,
 * referenceId, and paymentUrl are fixed at creation time by GlobalPay.
 *
 * Body: { linkId, orderId, clientName?, repName?, invoice? }
 *   linkId  — Firestore document ID of the payment link
 *   orderId — The associated order ID, or "" for standalone (top-level) links
 *
 * Returns: { ok }
 */

const BodySchema = z.object({
  linkId: z.string().min(1),
  orderId: z.string(),
  clientName: z.string().optional(),
  repName: z.string().optional(),
  invoice: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  const { linkId, orderId, clientName, repName, invoice } = body;

  try {
    const db = adminDb;
    const linkRef = orderId
      ? db.collection('orders').doc(orderId).collection('paymentLinks').doc(linkId)
      : db.collection('paymentLinks').doc(linkId);

    const linkSnap = await linkRef.get();
    if (!linkSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Link not found' }, { status: 404 });
    }

    const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (clientName !== undefined) payload.clientName = clientName;
    if (repName !== undefined) payload.repName = repName;
    if (invoice !== undefined) payload.invoice = invoice;

    await linkRef.update(payload);

    console.log(
      `[payments/update-link] Updated linkId=${linkId} orderId="${orderId}" fields=${Object.keys(payload).filter(k => k !== 'updatedAt').join(',')} by ${auth.email}`,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[payments/update-link] Error:', err);
    return NextResponse.json(
      { ok: false, error: 'Update failed', details: String(err) },
      { status: 500 },
    );
  }
}
