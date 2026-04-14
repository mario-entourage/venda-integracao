/**
 * Payment domain model.
 *
 * REPLACE LATER: map this to a Stripe PaymentIntent or Firestore "payments" collection.
 * Stripe: use paymentIntent.id as payment.id, amount_received as amount.
 */

export type PaymentStatus = "pending" | "completed";

export interface Payment {
  id: string;
  orderId: string;
  /** Amount in cents */
  amount: number;
  status: PaymentStatus;
  createdAt: Date;
}
