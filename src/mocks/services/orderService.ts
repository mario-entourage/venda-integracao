/**
 * Order Service — mock implementation.
 *
 * Handles order creation and completion. Interacts with mockDB directly.
 *
 * REPLACE LATER:
 *   - createOrder()         → Firestore transaction: read product, decrement stock, addDoc order
 *   - markOrderCompleted()  → Firestore updateDoc(orderRef, { orderStatus: "completed" })
 */

import { mockDB } from "../mockDB";
import { generateOrder } from "../mockOrders";
import { MockOrder } from "../types/order";

export function createOrder(productId: string, quantity: number): MockOrder {
  const product = mockDB.products.find((p) => p.id === productId);
  if (!product) throw new Error(`[OrderService] Product not found: ${productId}`);
  if (product.stock < quantity)
    throw new Error(`[OrderService] Not enough stock for: ${productId}`);

  const total = product.price * quantity;
  const order = generateOrder(productId, quantity, total);

  // Deduct stock at order creation time.
  product.stock -= quantity;

  mockDB.orders.push(order);
  console.log(
    `[OrderService] Order created: ${order.id} — ${quantity}x ${product.name} = ${total}¢`
  );
  return order;
}

export function markOrderCompleted(orderId: string): MockOrder {
  const order = mockDB.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`[OrderService] Order not found: ${orderId}`);
  if (order.orderStatus !== "shipped")
    throw new Error(
      `[OrderService] Cannot complete order in status: ${order.orderStatus}`
    );

  order.orderStatus = "completed";
  console.log(`[OrderService] Order completed: ${orderId}`);
  return order;
}

export function getOrder(orderId: string): MockOrder {
  const order = mockDB.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`[OrderService] Order not found: ${orderId}`);
  return order;
}
