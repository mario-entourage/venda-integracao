'use server';

import { adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Payment-provider integration is in transition: GlobalPay has been removed
 * and the replacement (working name "PayCo") has not landed yet.
 *
 * The link-creation actions below preserve their original signatures so the
 * UI callers don't break, but they now return an error indicating the
 * provider is not configured. Pure-Firestore actions (e.g. assigning an
 * existing standalone link to an order) are unaffected and still work.
 */

const PAYCO_UNAVAILABLE_MSG =
  'Provedor de pagamento indisponível — aguardando integração com a PayCo.';

/**
 * Generate a payment link tied to an order.
 *
 * Currently a no-op stub returning a structured error; the UI surfaces
 * `error` to the user. Re-enable by wiring in the new PayCo client and
 * restoring the full implementation (see git history pre-removal for
 * the GlobalPay version that this replaces).
 */
export async function generatePaymentLink(
  _orderId: string,
  _amount: number,
  _currency: string = 'USD',
  _customerName?: string,
  _customerPhone?: string,
  _customerEmail?: string,
  _customerDocument?: string,
  _allowedPaymentMethods?: {
    creditCard: boolean;
    debitCard: boolean;
    boleto: boolean;
    pix: boolean;
  },
  _repDisplayName?: string,
): Promise<{
  paymentUrl: string;
  gpOrderId: string;
  status: string;
  invoiceNumber?: string;
  error?: string;
}> {
  return {
    paymentUrl: '',
    gpOrderId: '',
    status: 'error',
    error: PAYCO_UNAVAILABLE_MSG,
  };
}

/**
 * Create a standalone payment link (not tied to any order). Stub —
 * see notes on generatePaymentLink above.
 */
export async function generateStandalonePaymentLink(
  _amount: number,
  _currency: string = 'BRL',
  _customerName?: string,
  _customerPhone?: string,
  _customerEmail?: string,
  _customerDocument?: string,
  _repName?: string,
): Promise<{
  paymentUrl: string;
  gpOrderId: string;
  invoiceNumber: string;
  status: string;
  error?: string;
}> {
  return {
    paymentUrl: '',
    gpOrderId: '',
    invoiceNumber: '',
    status: 'error',
    error: PAYCO_UNAVAILABLE_MSG,
  };
}

/**
 * Assign an unassigned (standalone) payment link to an existing order.
 * Moves the doc from top-level `paymentLinks/{id}` to
 * `orders/{orderId}/paymentLinks/{id}`. Pure Firestore — provider-agnostic.
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

    batch.set(destRef, {
      ...data,
      orderId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.delete(sourceRef);

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
