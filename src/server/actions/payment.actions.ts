'use server';

import { createGlobalPayLink, GlobalPayError } from '@/server/integrations/globalpay';
import { generateInvoiceNumber } from '@/server/actions/invoice.actions';
import { adminDb } from '@/firebase/admin';

/**
 * Generate a payment link via GlobalPay and return the URL + GP order ID.
 *
 * Called from the StepPagamento component after order creation.
 * The amount is passed in the currency's major unit (e.g. 199.99 USD).
 *
 * When repDisplayName is provided, a programmatic invoice number is generated
 * in the format "ETGANS#####" and used as the referenceId instead of the orderId.
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
  repDisplayName?: string,
): Promise<{
  paymentUrl: string;
  gpOrderId: string;
  status: string;
  invoiceNumber?: string;
  error?: string;
}> {
  try {
    // Generate programmatic invoice number if rep name is provided
    let invoiceNumber: string | undefined;
    let referenceId = orderId;

    if (repDisplayName) {
      invoiceNumber = await generateInvoiceNumber(repDisplayName);
      referenceId = invoiceNumber;

      // Store invoice number on the order
      await adminDb.collection('orders').doc(orderId).update({
        invoice: invoiceNumber,
      });
    }

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
      referenceId,
      callbackUrl,
      description: invoiceNumber
        ? `Entourage PhytoLab — ${invoiceNumber}`
        : `Entourage PhytoLab — Pedido ${orderId.slice(0, 8).toUpperCase()}`,
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
      invoiceNumber,
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
