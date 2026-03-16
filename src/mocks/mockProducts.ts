/**
 * Mock product data generators.
 *
 * REPLACE LATER: replace generateProduct() calls with Firestore writes:
 *   await addDoc(collection(db, "products"), { name, price, stock })
 */

import { MockProduct } from "./types/product";

let productCounter = 1;

export function generateProduct(
  name: string,
  price: number,
  stock: number
): MockProduct {
  const id = `product-${productCounter++}`;
  return { id, name, price, stock };
}
