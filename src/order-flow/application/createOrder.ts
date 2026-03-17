/**
 * createOrder — application command.
 *
 * Validates input, computes the total, persists the order, and returns it.
 *
 * REPLACE LATER: call a Firestore transaction here to guarantee atomic writes
 * and stock deduction in a single operation.
 */

import type { Order, OrderProduct } from "../domain/order";
import { saveOrder } from "../infrastructure/orderStore";

export interface CreateOrderInput {
  products: OrderProduct[];
  customer: string;
}

export function createOrder(input: CreateOrderInput): Order {
  if (input.products.length === 0) {
    throw new Error("An order must contain at least one product.");
  }

  const id = `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const totalAmount = input.products.reduce(
    (sum, p) => sum + p.price * p.quantity,
    0,
  );

  const order: Order = {
    id,
    products: input.products,
    totalAmount,
    customer: input.customer,
    status: "Created",
    createdAt: new Date(),
  };

  saveOrder(order);
  return order;
}
