import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { Resend } from 'resend';

/**
 * GlobalPay payment webhook — fires when a payment link is paid or fails.
 *
 * Payload shape (GlobalPay notification POST):
 * {
 *   "invoice":   "<invoiceNumber or orderId>",
 *   "orderId":   "<gpOrderId>",
 *   "status":    "approved" | "failed" | ...,
 *   "amount":    100.00,
 *   "currency":  "USD",
 *   ...
 * }
 *
 * The `invoice` field equals the `referenceId` we passed at link creation time.
 * For new orders this is the programmatic invoice number ("ETGA NS #####").
 * For legacy orders this is the Firestore order ID.
 */

// GlobalPay "approved" status values
const APPROVED_STATUSES = new Set(['approved', 'paid', 'completed', 'success']);

/**
 * Resolve the Firestore order ID from the webhook's invoice/referenceId.
 * - If it looks like an ETGA invoice number, query the `invoice` field on orders.
 * - Otherwise, treat it as a direct Firestore doc ID (legacy behavior).
 */
async function resolveOrderId(
  invoiceOrId: string,
): Promise<{ orderId: string; orderRef: FirebaseFirestore.DocumentReference } | null> {
  // New format: starts with "ETGA"
  if (invoiceOrId.startsWith('ETGA')) {
    const snap = await adminDb
      .collection('orders')
      .where('invoice', '==', invoiceOrId)
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return { orderId: doc.id, orderRef: doc.ref };
    }
    return null;
  }

  // Legacy: direct doc ID
  const ref = adminDb.collection('orders').doc(invoiceOrId);
  const snap = await ref.get();
  return snap.exists ? { orderId: invoiceOrId, orderRef: ref } : null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[webhook/payment] Received:', JSON.stringify(body));

  // ── Parse payload ──────────────────────────────────────────────────────────

  const invoiceOrId = String(body.invoice ?? body.referenceId ?? '').trim();
  const gpOrderId = String(body.orderId ?? body.gpOrderId ?? '').trim();
  const rawStatus = String(body.status ?? body.statusType ?? '').toLowerCase().trim();
  const amount = Number(body.amount ?? 0);
  const currency = String(body.currency ?? 'USD');

  const isApproved = APPROVED_STATUSES.has(rawStatus);

  console.log(
    `[webhook/payment] invoice="${invoiceOrId}" gpOrderId="${gpOrderId}"`,
    `status="${rawStatus}" approved=${isApproved}`,
  );

  if (!invoiceOrId) {
    console.warn('[webhook/payment] No invoice/referenceId in payload — cannot identify order');
    return NextResponse.json({ received: true, processed: false });
  }

  // ── Load order ─────────────────────────────────────────────────────────────

  const resolved = await resolveOrderId(invoiceOrId);

  if (!resolved) {
    console.warn(`[webhook/payment] Order not found for "${invoiceOrId}"`);
    return NextResponse.json({ received: true, processed: false });
  }

  const { orderId, orderRef } = resolved;
  const orderSnap = await orderRef.get();
  const orderData = orderSnap.data() ?? {};

  // ── Find matching payment link ─────────────────────────────────────────────

  const paymentLinksRef = orderRef.collection('paymentLinks');

  let paymentLinkId: string | null = null;

  if (gpOrderId) {
    const linkSnap = await paymentLinksRef
      .where('referenceId', '==', gpOrderId)
      .limit(1)
      .get();
    if (!linkSnap.empty) paymentLinkId = linkSnap.docs[0].id;
  }

  if (!paymentLinkId) {
    const linkSnap = await paymentLinksRef
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!linkSnap.empty) paymentLinkId = linkSnap.docs[0].id;
  }

  // ── Update payment link status ─────────────────────────────────────────────

  if (paymentLinkId) {
    await paymentLinksRef.doc(paymentLinkId).update({
      status: isApproved ? 'paid' : rawStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[webhook/payment] PaymentLink "${paymentLinkId}" → "${isApproved ? 'paid' : rawStatus}"`);
  }

  // ── Record payment + update order (approved only) ──────────────────────────

  if (isApproved) {
    await orderRef.collection('payments').add({
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

    const currentStatus = String(orderData.status ?? '');
    const isFinalStatus = ['paid', 'shipped', 'delivered'].includes(currentStatus);

    if (!isFinalStatus) {
      await orderRef.update({
        status: 'paid',
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[webhook/payment] Order "${orderId}" marked as paid`);
    } else {
      console.log(
        `[webhook/payment] Order "${orderId}" already at status "${currentStatus}" — skipping`,
      );
    }

    // ── Notify rep about payment received ──────────────────────────────────
    await notifyRepPaymentReceived(orderId, orderData, amount, currency);
  }

  return NextResponse.json({ received: true, processed: isApproved });
}

// ---------------------------------------------------------------------------
// Helper: create notification + send email for payment received
// ---------------------------------------------------------------------------

async function notifyRepPaymentReceived(
  orderId: string,
  orderData: Record<string, unknown>,
  amount: number,
  currency: string,
) {
  try {
    // Get rep user ID from the order's representative subcollection
    const repSnap = await adminDb
      .collection('orders')
      .doc(orderId)
      .collection('representative')
      .limit(1)
      .get();
    if (repSnap.empty) return;

    const repUserId = repSnap.docs[0].data().userId;
    if (!repUserId) return;

    // Look up rep's email
    const userSnap = await adminDb.collection('users').doc(repUserId).get();
    if (!userSnap.exists) return;
    const repEmail = userSnap.data()?.email;

    const fmtAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(amount);

    const invoice = String(orderData.invoice || orderId.slice(0, 8).toUpperCase());
    const title = 'Pagamento recebido';
    const body = `Pedido ${invoice} — ${fmtAmount}`;

    // In-app notification (via admin SDK)
    await adminDb.collection('notifications').add({
      recipientUserId: repUserId,
      type: 'payment_received',
      title,
      body,
      orderId,
      read: false,
      emailSent: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Email notification (fire-and-forget)
    if (repEmail && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Entourage Lab <noreply@entouragelab.com>',
        to: repEmail,
        subject: `${title} — ${body}`,
        html: `<p>Olá,</p><p>O pagamento do pedido <strong>${invoice}</strong> no valor de <strong>${fmtAmount}</strong> foi confirmado.</p><p>Acesse o sistema para mais detalhes.</p>`,
      });
    }

    console.log(`[webhook/payment] Rep ${repUserId} notified about payment for ${orderId}`);
  } catch (err) {
    console.error('[webhook/payment] Notification failed (non-fatal):', err);
  }
}
