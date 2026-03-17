"use server";

/**
 * generatePaymentLink — application command (Server Action).
 *
 * 1. Validates the order exists and is in "Created" status.
 * 2. Creates a Payment record.
 * 3. Transitions order status → "Pending Payment".
 * 4. Redirects to the payment page.
 *
 * REPLACE LATER:
 *   - Payment creation → stripe.paymentIntents.create({ amount, currency: "brl" })
 *   - Order update     → updateDoc(doc(db, "orders", orderId), { status: "Pending Payment" })
 *   - redirect URL     → use the Stripe-hosted payment link or your checkout page
 */

import { redirect } from "next/navigation";
import type { Payment } from "../domain/payment";
import { getOrderById, saveOrder } from "../infrastructure/orderStore";
import { savePayment } from "../infrastructure/paymentStore";

export async function generatePaymentLink(orderId: string): Promise<never> {
  const order = getOrderById(orderId);

  if (!order) {
    throw new Error(`Order "${orderId}" not found.`);
  }

  if (order.status !== "Created") {
    throw new Error(
      `Cannot generate payment link: order is already "${order.status}".`,
    );
  }

  const paymentId = `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const payment: Payment = {
    id: paymentId,
    orderId: order.id,
    amount: order.totalAmount,
    status: "pending",
    createdAt: new Date(),
  };

  // Persist payment first, then update order status (order matters for consistency)
  savePayment(payment);
  saveOrder({ ...order, status: "Pending Payment" });

  redirect(`/order-flow/payment/${paymentId}`);
}
