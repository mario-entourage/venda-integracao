/**
 * Scheduled Cloud Function: check pending GlobalPay payment links every 15 minutes.
 *
 * Queries all paymentLinks with status === 'created' from the last 24h,
 * checks their status via GlobalPay API, and updates accordingly.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { queryGlobalPayTransaction, GLOBALPAY_API_URL, GLOBALPAY_PUB_KEY, GLOBALPAYS_MERCHANT_CODE } from './globalpay';

const APPROVED_STATUSES = new Set(['approved', 'paid', 'completed', 'success']);
const TERMINAL_STATUSES = new Set(['expired', 'cancelled', 'failed', 'rejected']);

export const checkPendingPayments = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'us-central1',
    secrets: [GLOBALPAY_API_URL, GLOBALPAY_PUB_KEY, GLOBALPAYS_MERCHANT_CODE],
  },
  async () => {
    const db = admin.firestore();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Collection group query for all paymentLinks with status 'created'
    const pendingLinks = await db
      .collectionGroup('paymentLinks')
      .where('status', '==', 'created')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(cutoff))
      .get();

    console.log(`[check-payments] Found ${pendingLinks.size} pending payment link(s)`);

    let approved = 0;
    let terminal = 0;
    let errors = 0;

    for (const linkDoc of pendingLinks.docs) {
      const linkData = linkDoc.data();
      const gpOrderId = linkData.referenceId;
      const orderId = linkData.orderId;

      if (!gpOrderId) continue;

      try {
        const txData = await queryGlobalPayTransaction(gpOrderId);
        const status = String(txData.status ?? txData.statusType ?? '').toLowerCase();

        if (APPROVED_STATUSES.has(status)) {
          // Mark link as paid
          await linkDoc.ref.update({
            status: 'paid',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Create payment record
          await db.collection('orders').doc(orderId).collection('payments').add({
            provider: 'globalpay',
            status: 'approved',
            amount: linkData.amount,
            currency: linkData.currency,
            paymentLinkId: linkDoc.id,
            paymentId: gpOrderId,
            paymentUrl: '',
            orderId,
            paymentDate: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update order status
          const orderSnap = await db.collection('orders').doc(orderId).get();
          const currentStatus = orderSnap.data()?.status;
          if (!['paid', 'shipped', 'delivered'].includes(currentStatus)) {
            await db.collection('orders').doc(orderId).update({
              status: 'paid',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // Notify rep about payment
          await notifyRepPaymentReceived(db, orderId, linkData.amount, linkData.currency);

          approved++;
          console.log(`[check-payments] ${gpOrderId} → APPROVED (order ${orderId})`);
        } else if (TERMINAL_STATUSES.has(status)) {
          await linkDoc.ref.update({
            status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          terminal++;
          console.log(`[check-payments] ${gpOrderId} → ${status}`);
        }
        // else: still pending, no action needed
      } catch (err) {
        errors++;
        console.error(`[check-payments] Error checking ${gpOrderId}:`, err);
      }
    }

    console.log(
      `[check-payments] Done: ${approved} approved, ${terminal} terminal, ${errors} errors`,
    );
  },
);

// ---------------------------------------------------------------------------
// Helper: create in-app notification for payment received
// ---------------------------------------------------------------------------

async function notifyRepPaymentReceived(
  db: admin.firestore.Firestore,
  orderId: string,
  amount: number,
  currency: string,
) {
  try {
    const orderSnap = await db.collection('orders').doc(orderId).get();
    const orderData = orderSnap.data() ?? {};

    // Get rep from subcollection
    const repSnap = await db
      .collection('orders')
      .doc(orderId)
      .collection('representative')
      .limit(1)
      .get();
    if (repSnap.empty) return;

    const repUserId = repSnap.docs[0].data().userId;
    if (!repUserId) return;

    const fmtAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(amount);

    const invoice = String(orderData.invoice || orderId.slice(0, 8).toUpperCase());

    await db.collection('notifications').add({
      recipientUserId: repUserId,
      type: 'payment_received',
      title: 'Pagamento recebido',
      body: `Pedido ${invoice} — ${fmtAmount}`,
      orderId,
      read: false,
      emailSent: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`[check-payments] Notification failed for order ${orderId}:`, err);
  }
}
