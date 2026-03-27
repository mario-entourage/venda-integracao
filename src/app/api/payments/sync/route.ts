import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { getGlobalPayTransaction } from '@/server/integrations/globalpay';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

/**
 * POST /api/payments/sync
 *
 * Manually trigger a GlobalPay status sync for all pending payment links.
 * Mirrors the scheduled Cloud Function (check-payments.ts) but callable on demand.
 *
 * - Queries ALL paymentLinks with status === 'created' (no time cutoff)
 * - For each, calls GlobalPay's query endpoint using the stored referenceId
 * - On approved: marks link as 'paid', creates payment record, advances order to 'paid'
 * - On terminal (expired/cancelled/failed): marks link accordingly
 *
 * Returns: { checked, approved, terminal, errors, updatedOrders }
 */

const APPROVED_STATUSES = new Set(['approved', 'paid', 'completed', 'success']);
const TERMINAL_STATUSES = new Set(['expired', 'cancelled', 'failed', 'rejected']);

const BodySchema = z.object({
  orderId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  try {
    const db = adminDb;
    const targetOrderId = body.orderId ?? null;

    // When orderId is provided, only check that order's payment links.
    // Otherwise check ALL pending links across every order (no time cutoff).
    const pendingSnap = targetOrderId
      ? await db
          .collection('orders')
          .doc(targetOrderId)
          .collection('paymentLinks')
          .where('status', '==', 'created')
          .get()
      : await db
          .collectionGroup('paymentLinks')
          .where('status', '==', 'created')
          .get();

    let checked = 0;
    let approved = 0;
    let terminal = 0;
    let errors = 0;
    const updatedOrders: string[] = [];

    for (const linkDoc of pendingSnap.docs) {
      const linkData = linkDoc.data();
      const gpOrderId = String(linkData.referenceId ?? '');

      // Extract orderId from stored field, falling back to the document path
      // Path structure: orders/{orderId}/paymentLinks/{linkId}
      const orderId = String(
        linkData.orderId ?? linkDoc.ref.parent?.parent?.id ?? '',
      );

      if (!gpOrderId) {
        console.warn(`[payments/sync] Skipping ${linkDoc.id}: no referenceId`);
        continue;
      }
      if (!orderId) {
        console.warn(`[payments/sync] Skipping ${linkDoc.id}: cannot resolve orderId`);
        continue;
      }
      checked++;

      try {
        const txData = await getGlobalPayTransaction(gpOrderId);
        const rawStatus = String(
          txData.status ?? txData.statusType ?? txData.statustype ?? '',
        ).toLowerCase().trim();

        if (APPROVED_STATUSES.has(rawStatus)) {
          // ── Mark link paid ──────────────────────────────────────────────
          await linkDoc.ref.update({
            status: 'paid',
            updatedAt: FieldValue.serverTimestamp(),
          });

          // ── Record payment ──────────────────────────────────────────────
          const orderRef = db.collection('orders').doc(orderId);
          await orderRef.collection('payments').add({
            provider: 'globalpay',
            status: 'approved',
            amount: linkData.amount ?? 0,
            currency: linkData.currency ?? 'USD',
            paymentLinkId: linkDoc.id,
            paymentId: gpOrderId,
            paymentUrl: '',
            orderId,
            paymentDate: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          // ── Advance order status ────────────────────────────────────────
          const orderSnap = await orderRef.get();
          const currentStatus = String(orderSnap.data()?.status ?? '');
          if (!['paid', 'shipped', 'delivered'].includes(currentStatus)) {
            await orderRef.update({
              status: 'paid',
              updatedAt: FieldValue.serverTimestamp(),
            });
            updatedOrders.push(orderId);
          }

          approved++;
        } else if (TERMINAL_STATUSES.has(rawStatus)) {
          await linkDoc.ref.update({
            status: rawStatus,
            updatedAt: FieldValue.serverTimestamp(),
          });
          terminal++;
        }
        // else still pending — no change
      } catch (err) {
        errors++;
        console.error(`[payments/sync] Error checking gpOrderId="${gpOrderId}":`, err);
      }
    }

    console.log(
      `[payments/sync] checked=${checked} approved=${approved} terminal=${terminal} errors=${errors} triggeredBy=${auth.email}`,
    );

    return NextResponse.json({
      ok: true,
      checked,
      approved,
      terminal,
      errors,
      updatedOrders,
    });
  } catch (err) {
    console.error('[payments/sync] Fatal error:', err);
    return NextResponse.json(
      { ok: false, error: 'Sync failed', details: String(err) },
      { status: 500 },
    );
  }
}
