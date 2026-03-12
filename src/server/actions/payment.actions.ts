'use server';

import { createGlobalPayLink, GlobalPayError } from '@/server/integrations/globalpay';
import { generateInvoiceNumber, generateManualInvoiceNumber } from '@/server/actions/invoice.actions';
import { adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

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

/**
 * Create a standalone GlobalPay payment link (not tied to any order).
 * Admin-only. Invoice format: ETGM#####.
 * The link is stored in a top-level `paymentLinks` collection with orderId = ''.
 */
export async function generateStandalonePaymentLink(
  amount: number,
  currency: string = 'BRL',
  customerName?: string,
  customerPhone?: string,
  customerEmail?: string,
  customerDocument?: string,
): Promise<{
  paymentUrl: string;
  gpOrderId: string;
  invoiceNumber: string;
  status: string;
  error?: string;
}> {
  try {
    const invoiceNumber = await generateManualInvoiceNumber();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.entouragelab.com';
    const callbackUrl = `${appUrl}/pagamentos`;

    const result = await createGlobalPayLink({
      amount,
      currency,
      merchantCode: process.env.GLOBALPAYS_MERCHANT_CODE || '4912',
      referenceId: invoiceNumber,
      callbackUrl,
      description: `Entourage PhytoLab — ${invoiceNumber}`,
      customerName,
      customerPhone,
      customerEmail,
      customerDocument,
    });

    // Persist to top-level paymentLinks collection (unassigned)
    await adminDb.collection('paymentLinks').doc(result.gpOrderId).set({
      status: 'created',
      currency,
      amount,
      referenceId: invoiceNumber,
      paymentUrl: result.paymentUrl,
      provider: 'globalpay',
      feeForMerchant: false,
      installmentMerchant: 1,
      secretKey: '',
      orderId: '',
      invoice: invoiceNumber,
      clientName: customerName || '',
      repName: '',
      doctorName: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      paymentUrl: result.paymentUrl,
      gpOrderId: result.gpOrderId,
      invoiceNumber,
      status: result.status,
    };
  } catch (err) {
    console.error('[generateStandalonePaymentLink] Error:', err);

    const message =
      err instanceof GlobalPayError
        ? err.message
        : 'Erro inesperado ao gerar link de pagamento avulso.';

    return {
      paymentUrl: '',
      gpOrderId: '',
      invoiceNumber: '',
      status: 'error',
      error: message,
    };
  }
}

/**
 * Assign an unassigned (standalone) payment link to an existing order.
 * Moves the doc from top-level `paymentLinks/{id}` to `orders/{orderId}/paymentLinks/{id}`.
 */
export async function assignPaymentToOrder(
  paymentLinkId: string,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sourceRef = adminDb.collection('paymentLinks').doc(paymentLinkId);
    const sourceSnap = await sourceRef.get();

    if (!sourceSnap.exists) {
      return { ok: false, error: 'Pagamento avulso não encontrado.' };
    }

    const data = sourceSnap.data()!;
    if (data.orderId && data.orderId !== '') {
      return { ok: false, error: 'Este pagamento já está vinculado a um pedido.' };
    }

    const destRef = adminDb
      .collection('orders')
      .doc(orderId)
      .collection('paymentLinks')
      .doc(paymentLinkId);

    const batch = adminDb.batch();

    // Write to order subcollection with updated orderId
    batch.set(destRef, {
      ...data,
      orderId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Delete from top-level collection
    batch.delete(sourceRef);

    // Update order's invoice field
    if (data.invoice) {
      const orderRef = adminDb.collection('orders').doc(orderId);
      batch.update(orderRef, {
        invoice: data.invoice,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    return { ok: true };
  } catch (err) {
    console.error('[assignPaymentToOrder] Error:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao vincular pagamento.',
    };
  }
}
