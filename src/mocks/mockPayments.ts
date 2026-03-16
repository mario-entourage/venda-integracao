/**
 * Mock payment simulator.
 *
 * Simulates a synchronous payment approval. Always succeeds in mock mode.
 *
 * REPLACE LATER: call the Stripe API to create a PaymentIntent:
 *   const intent = await stripe.paymentIntents.create({
 *     amount: order.total,
 *     currency: "brl",
 *     confirm: true,
 *     payment_method: "pm_card_visa",
 *   });
 *   return intent.status === "succeeded";
 */

export function simulatePaymentApproval(_orderId: string): boolean {
  // In mock mode, every payment is approved instantly.
  return true;
}
