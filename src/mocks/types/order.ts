/**
 * Mock type definitions for Order.
 *
 * REPLACE LATER: swap this with your Firestore order document type.
 * Payment status values map directly to Stripe PaymentIntent statuses.
 * Order status values map to your shipping provider's lifecycle events.
 */

export type PaymentStatus = "pending" | "paid" | "failed";

export type OrderStatus = "pending" | "paid" | "shipped" | "completed";

export interface MockOrder {
  id: string;
  productId: string;
  quantity: number;
  total: number; // in cents
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  trackingNumber: string | null;
}
