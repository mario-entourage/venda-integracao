/**
 * Admin Service — mock implementation.
 *
 * Business logic for admin operations. Calls mock generators and writes
 * to the in-memory mockDB.
 *
 * REPLACE LATER:
 *   - createAdmin()   → Firebase Admin SDK createUser + setCustomUserClaims
 *   - createProduct() → Firestore addDoc to "products" collection
 *   - listOrders()    → Firestore getDocs on "orders" collection
 */

import { mockDB } from "../mockDB";
import { generateAdmin } from "../mockAdmin";
import { generateProduct } from "../mockProducts";
import { MockUser } from "../types/user";
import { MockProduct } from "../types/product";
import { MockOrder } from "../types/order";

export function createAdmin(email?: string): MockUser {
  const admin = generateAdmin(email);
  mockDB.users.push(admin);
  console.log(`[AdminService] Admin created: ${admin.id} (${admin.email})`);
  return admin;
}

export function createProduct(
  name: string,
  price: number,
  stock: number
): MockProduct {
  const product = generateProduct(name, price, stock);
  mockDB.products.push(product);
  console.log(
    `[AdminService] Product created: ${product.id} — ${product.name} @ ${price}¢ (stock: ${stock})`
  );
  return product;
}

export function listOrders(): MockOrder[] {
  console.log(`[AdminService] Listing all orders (${mockDB.orders.length} total)`);
  return mockDB.orders;
}
