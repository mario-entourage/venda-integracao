/**
 * Product Service — mock implementation.
 *
 * REPLACE LATER:
 *   - createProduct() → Firestore addDoc("products", data)
 *   - listProducts()  → Firestore getDocs(collection(db, "products"))
 *   - updateStock()   → Firestore updateDoc with increment(-qty)
 */

import { mockDB } from "../mockDB";
import { generateProduct } from "../mockProducts";
import { MockProduct } from "../types/product";

export function createProduct(
  name: string,
  price: number,
  stock: number
): MockProduct {
  const product = generateProduct(name, price, stock);
  mockDB.products.push(product);
  return product;
}

export function listProducts(): MockProduct[] {
  return mockDB.products;
}

export function updateStock(productId: string, delta: number): MockProduct {
  const product = mockDB.products.find((p) => p.id === productId);
  if (!product) throw new Error(`[ProductService] Product not found: ${productId}`);

  const newStock = product.stock + delta;
  if (newStock < 0) throw new Error(`[ProductService] Insufficient stock for: ${productId}`);

  product.stock = newStock;
  console.log(
    `[ProductService] Stock updated: ${productId} → ${product.stock} units`
  );
  return product;
}
