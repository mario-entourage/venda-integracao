/**
 * In-memory order store using a module-level singleton.
 *
 * The `globalThis` pattern keeps the Map alive across Next.js HMR reloads
 * in development, where module cache can be cleared between hot updates.
 *
 * REPLACE LATER: swap every function body for a Firestore call.
 *   saveOrder    → setDoc(doc(db, "orders", order.id), order)
 *   getOrderById → getDoc(doc(db, "orders", orderId))
 */

import type { Order } from "../domain/order";

declare global {
   
  var __orderFlowOrderStore: Map<string, Order> | undefined;
}

const store: Map<string, Order> =
  globalThis.__orderFlowOrderStore ??
  (globalThis.__orderFlowOrderStore = new Map());

export function saveOrder(order: Order): void {
  store.set(order.id, order);
}

export function getOrderById(orderId: string): Order | undefined {
  return store.get(orderId);
}

export function listOrders(): Order[] {
  return Array.from(store.values());
}
