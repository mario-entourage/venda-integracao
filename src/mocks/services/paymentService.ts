/**
 * Payment Service — mock implementation.
 *
 * Simulates a payment flow. In mock mode, payments always succeed.
 *
 * REPLACE LATER: integrate Stripe:
 *   1. Create a PaymentIntent server-side via stripe.paymentIntents.create()
 *   2. Return the client_secret to the frontend
 *   3. Frontend confirms with stripe.confirmPayment()
 *   4. Listen to webhook "payment_intent.succeeded" to update order status
 *
 * Webhook handler example:
 *   case "payment_intent.succeeded":
 *     await updateDoc(orderRef, { paymentStatus: "paid", orderStatus: "paid" })
 */

import { mockDB } from "../mockDB";
import { simulatePaymentApproval } from "../mockPayments";
import { MockOrder } from "../types/order";

export function simulatePayment(orderId: string): MockOrder {
  const order = mockDB.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`[PaymentService] Order not found: ${orderId}`);
  if (order.paymentStatus !== "pending")
    throw new Error(
      `[PaymentService] Order already processed: ${orderId} (${order.paymentStatus})`
    );

  const approved = simulatePaymentApproval(orderId);

  if (approved) {
    order.paymentStatus = "paid";
    order.orderStatus = "paid";
    console.log(`[PaymentService] Payment approved for order: ${orderId}`);
  } else {
    order.paymentStatus = "failed";
    console.log(`[PaymentService] Payment failed for order: ${orderId}`);
  }

  return order;
}
