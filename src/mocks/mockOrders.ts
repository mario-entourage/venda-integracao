/**
 * Mock order data generators.
 *
 * REPLACE LATER: replace generateOrder() calls with Firestore writes:
 *   await addDoc(collection(db, "orders"), { productId, quantity, total, ... })
 */

import { MockOrder } from "./types/order";

let orderCounter = 1;

export function generateOrder(
  productId: string,
  quantity: number,
  total: number
): MockOrder {
  const id = `order-${orderCounter++}`;
  return {
    id,
    productId,
    quantity,
    total,
    paymentStatus: "pending",
    orderStatus: "pending",
    trackingNumber: null,
  };
}
