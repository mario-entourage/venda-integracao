'use server';

import { Resend } from 'resend';
import { adminDb } from '@/firebase/admin';

/**
 * Send order-created notification emails to all users who have
 * notificationPreferences.emailOnOrderCreated === true.
 *
 * Non-fatal — errors are logged but do not throw.
 */
export async function notifyOrderCreated(params: {
  orderId: string;
  customerName: string;
  amount: number;
  currency: string;
  repName?: string;
}): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[notifyOrderCreated] RESEND_API_KEY not set — skipping');
      return;
    }

    // Query all users who opted in to order notifications
    const snap = await adminDb
      .collection('users')
      .where('notificationPreferences.emailOnOrderCreated', '==', true)
      .get();

    if (snap.empty) return;

    const fmtAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: params.currency || 'BRL',
    }).format(params.amount);

    const shortId = params.orderId.slice(0, 8).toUpperCase();
    const subject = `Nova venda registrada — ${params.customerName}`;
    const html = `
      <p>Olá,</p>
      <p>Uma nova venda foi registrada no sistema:</p>
      <ul>
        <li><strong>Pedido:</strong> #${shortId}</li>
        <li><strong>Cliente:</strong> ${params.customerName}</li>
        <li><strong>Valor:</strong> ${fmtAmount}</li>
        ${params.repName ? `<li><strong>Representante:</strong> ${params.repName}</li>` : ''}
      </ul>
      <p>Acesse o sistema para mais detalhes.</p>
    `;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const recipients = snap.docs.map((d) => d.data().email as string).filter(Boolean);

    await Promise.all(
      recipients.map((to) =>
        resend.emails.send({
          from: 'Entourage Lab <noreply@entouragelab.com>',
          to,
          subject,
          html,
        }),
      ),
    );

    console.log(`[notifyOrderCreated] Sent to ${recipients.length} recipient(s) for order ${params.orderId}`);
  } catch (err) {
    console.error('[notifyOrderCreated] Failed (non-fatal):', err);
  }
}

/**
 * Send payment-confirmed notification emails to all users who have
 * notificationPreferences.emailOnOrderCreated === true.
 *
 * Non-fatal — errors are logged but do not throw.
 */
export async function notifyPaymentConfirmed(params: {
  orderId: string;
  invoice: string;
  customerName: string;
  amount: number;
  currency: string;
}): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[notifyPaymentConfirmed] RESEND_API_KEY not set — skipping');
      return;
    }

    const snap = await adminDb
      .collection('users')
      .where('notificationPreferences.emailOnOrderCreated', '==', true)
      .get();

    if (snap.empty) return;

    const fmtAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: params.currency || 'BRL',
    }).format(params.amount);

    const subject = `Pagamento confirmado — ${params.customerName}`;
    const html = `
      <p>Olá,</p>
      <p>O pagamento de um pedido foi confirmado:</p>
      <ul>
        <li><strong>Pedido:</strong> ${params.invoice || '#' + params.orderId.slice(0, 8).toUpperCase()}</li>
        <li><strong>Cliente:</strong> ${params.customerName}</li>
        <li><strong>Valor:</strong> ${fmtAmount}</li>
      </ul>
      <p>Acesse o sistema para mais detalhes.</p>
    `;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const recipients = snap.docs.map((d) => d.data().email as string).filter(Boolean);

    await Promise.all(
      recipients.map((to) =>
        resend.emails.send({
          from: 'Entourage Lab <noreply@entouragelab.com>',
          to,
          subject,
          html,
        }),
      ),
    );

    console.log(`[notifyPaymentConfirmed] Sent to ${recipients.length} recipient(s) for order ${params.orderId}`);
  } catch (err) {
    console.error('[notifyPaymentConfirmed] Failed (non-fatal):', err);
  }
}
