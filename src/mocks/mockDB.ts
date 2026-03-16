/**
 * In-memory mock database.
 *
 * This module is the single source of truth for all mock data.
 * It is intentionally a plain mutable object — no persistence, no indexing.
 *
 * REPLACE LATER:
 *   - users   → Firebase Authentication + Firestore "users" collection
 *   - products → Firestore "products" collection
 *   - orders   → Firestore "orders" collection
 *
 * To remove: delete this file and update all service imports to use real SDKs.
 */

import { MockUser } from "./types/user";
import { MockProduct } from "./types/product";
import { MockOrder } from "./types/order";

interface MockDatabase {
  users: MockUser[];
  products: MockProduct[];
  orders: MockOrder[];
}

export const mockDB: MockDatabase = {
  users: [],
  products: [],
  orders: [],
};
