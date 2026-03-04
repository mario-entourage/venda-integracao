'use server';

import { createGlobalPayLink, GlobalPayError } from '@/server/integrations/globalpay';

/**
 * Generate a payment link via GlobalPay and return the URL + GP order ID.
 *
 * Called from the StepPagamento component after order creation.
 * The amount is passed in the currency's major unit (e.g. 199.99 USD).
 *
 * Note: Firestore persistence of the payment link is done client-side
 * via `createPaymentLink()` in the payments service — the server action
 * only handles the external API call.
 */
export async function generatePaymentLink(
  orderId: string,
  amount: number,
  currency: string = 'USD',
  customerName?: string,
  customerPhone?: string,
  customerEmail?: string,
  customerDocument?: string,
  allowedPaymentMethods?: {
    creditCard: boolean;
    debitCard: boolean;
    boleto: boolean;
    pix: boolean;
  },
): Promise<{
  paymentUrl: string;
  gpOrderId: string;
  status: string;
  error?: string;
}> {
  try {
    // Build the callback URL — customer is redirected here after payment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.entouragelab.com';
    const callbackUrl = `${appUrl}/controle/${orderId}`;

    // Build allowed payment methods list for GlobalPay
    const paymentMethods: string[] = [];
    if (allowedPaymentMethods) {
      if (allowedPaymentMethods.creditCard) paymentMethods.push('credit_card');
      if (allowedPaymentMethods.debitCard) paymentMethods.push('debit_card');
      if (allowedPaymentMethods.boleto) paymentMethods.push('boleto');
      if (allowedPaymentMethods.pix) paymentMethods.push('pix');
    }

    const result = await createGlobalPayLink({
      amount,
      currency,
      merchantCode: process.env.GLOBALPAYS_MERCHANT_CODE || '4912',
      referenceId: orderId,
      callbackUrl,
      description: `Entourage PhytoLab — Pedido ${orderId.slice(0, 8).toUpperCase()}`,
      customerName,
      customerPhone,
      customerEmail,
      customerDocument,
      ...(paymentMethods.length > 0 && paymentMethods.length < 4 && { paymentMethods }),
    });

    return {
      paymentUrl: result.paymentUrl,
      gpOrderId: result.gpOrderId,
      status: result.status,
    };
  } catch (err) {
    console.error('[generatePaymentLink] Error:', err);

    const message =
      err instanceof GlobalPayError
        ? err.message
        : 'Erro inesperado ao gerar link de pagamento.';

    return {
      paymentUrl: '',
      gpOrderId: '',
      status: 'error',
      error: message,
    };
  }
}
