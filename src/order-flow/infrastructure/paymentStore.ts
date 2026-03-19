/**
 * In-memory payment store using a module-level singleton.
 *
 * REPLACE LATER: swap every function body for a Firestore call.
 *   savePayment     → setDoc(doc(db, "payments", payment.id), payment)
 *   getPaymentById  → getDoc(doc(db, "payments", paymentId))
 *
 * Or with Stripe:
 *   savePayment     → stripe.paymentIntents.create({ amount, currency: "brl" })
 *   getPaymentById  → stripe.paymentIntents.retrieve(paymentId)
 */

import type { Payment } from "../domain/payment";

declare global {
   
  var __orderFlowPaymentStore: Map<string, Payment> | undefined;
}

const store: Map<string, Payment> =
  globalThis.__orderFlowPaymentStore ??
  (globalThis.__orderFlowPaymentStore = new Map());

export function savePayment(payment: Payment): void {
  store.set(payment.id, payment);
}

export function getPaymentById(paymentId: string): Payment | undefined {
  return store.get(paymentId);
}
