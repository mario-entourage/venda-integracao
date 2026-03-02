import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';

/**
 * GlobalPay payment webhook — fires when a payment link is paid or fails.
 *
 * Payload shape (GlobalPay notification POST):
 * {
 *   "invoice":   "<orderId>",      ← the `invoice` field we set when creating the link
 *   "orderId":   "<gpOrderId>",    ← GlobalPay's own order ID
 *   "status":    "approved" | "failed" | ...,
 *   "amount":    100.00,
 *   "currency":  "USD",
 *   ...
 * }
 *
 * Two steps to enable:
 *   1. In the GlobalPay merchant dashboard, set the notification URL to:
 *      https://app.entouragelab.com/api/webhooks/payment
 *   2. Ensure the `callbackUrl` sent when creating the payment link still
 *      points to the customer-facing redirect (already set to /controle/{orderId}).
 *
 * The `invoice` field in the payload equals the `referenceId` we passed at
 * link creation time — which is always the Entourage order ID.
 */

// GlobalPay "approved" status values — log unrecognised statuses so we can extend this.
const APPROVED_STATUSES = new Set(['approved', 'paid', 'completed', 'success']);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[webhook/payment] Received:', JSON.stringify(body));

  // ── Parse payload ──────────────────────────────────────────────────────────

  // `invoice` is what we sent as `referenceId` = orderId
  const orderId = String(body.invoice ?? body.referenceId ?? '').trim();
  const gpOrderId = String(body.orderId ?? body.gpOrderId ?? '').trim();
  const rawStatus = String(body.status ?? body.statusType ?? '').toLowerCase().trim();
  const amount = Number(body.amount ?? 0);
  const currency = String(body.currency ?? 'USD');

  const isApproved = APPROVED_STATUSES.has(rawStatus);

  console.log(
    `[webhook/payment] orderId="${orderId}" gpOrderId="${gpOrderId}"`,
    `status="${rawStatus}" approved=${isApproved}`,
  );

  if (!orderId) {
    console.warn('[webhook/payment] No invoice/referenceId in payload — cannot identify order');
    return NextResponse.json({ received: true, processed: false });
  }

  // ── Load order ─────────────────────────────────────────────────────────────

  const orderRef = adminDb.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    console.warn(`[webhook/payment] Order "${orderId}" not found in Firestore`);
    return NextResponse.json({ received: true, processed: false });
  }

  const orderData = orderSnap.data() ?? {};

  // ── Find matching payment link ─────────────────────────────────────────────

  const paymentLinksRef = adminDb
    .collection('orders').doc(orderId)
    .collection('paymentLinks');

  let paymentLinkId: string | null = null;

  if (gpOrderId) {
    // Match by GlobalPay order ID stored as `referenceId` in the PaymentLink doc
    const linkSnap = await paymentLinksRef
      .where('referenceId', '==', gpOrderId)
      .limit(1)
      .get();
    if (!linkSnap.empty) paymentLinkId = linkSnap.docs[0].id;
  }

  if (!paymentLinkId) {
    // Fallback: most recent payment link for this order
    const linkSnap = await paymentLinksRef
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!linkSnap.empty) paymentLinkId = linkSnap.docs[0].id;
  }

  // ── Update payment link status ─────────────────────────────────────────────

  if (paymentLinkId) {
    await adminDb
      .collection('orders').doc(orderId)
      .collection('paymentLinks').doc(paymentLinkId)
      .update({
        status: isApproved ? 'paid' : rawStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
    console.log(`[webhook/payment] PaymentLink "${paymentLinkId}" → "${isApproved ? 'paid' : rawStatus}"`);
  }

  // ── Record payment + update order (approved only) ──────────────────────────

  if (isApproved) {
    // Create a payment record for audit trail
    await adminDb
      .collection('orders').doc(orderId)
      .collection('payments')
      .add({
        provider: 'globalpay',
        status: 'approved',
        currency,
        amount,
        paymentLinkId: paymentLinkId ?? '',
        paymentId: gpOrderId,
        paymentUrl: '',
        orderId,
        paymentDate: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // Update order status — skip if already at a final state
    const currentStatus = String(orderData.status ?? '');
    const isFinalStatus = ['paid', 'shipped', 'delivered'].includes(currentStatus);

    if (!isFinalStatus) {
      await orderRef.update({
        status: 'paid',
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[webhook/payment] ✓ Order "${orderId}" marked as paid`);
    } else {
      console.log(
        `[webhook/payment] Order "${orderId}" already at status "${currentStatus}" — skipping status update`,
      );
    }
  }

  return NextResponse.json({ received: true, processed: isApproved });
}
