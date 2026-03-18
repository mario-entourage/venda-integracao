import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, Firestore, Query,
} from 'firebase/firestore';
import type { Product, Stock, StockProduct, ProductFormValues } from '@/types';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getProductsRef(db: Firestore) {
  return collection(db, 'products');
}

export function getProductRef(db: Firestore, productId: string) {
  return doc(db, 'products', productId);
}

export function getStocksRef(db: Firestore) {
  return collection(db, 'stocks');
}

export function getStockRef(db: Firestore, stockId: string) {
  return doc(db, 'stocks', stockId);
}

export function getStockProductsRef(db: Firestore) {
  return collection(db, 'stockProducts');
}

export function getStockProductRef(db: Firestore, stockProductId: string) {
  return doc(db, 'stockProducts', stockProductId);
}

// ---------------------------------------------------------------------------
// Product CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new product document from validated form values.
 *
 * @returns The auto-generated product document ID.
 */
export async function createProduct(
  db: Firestore,
  data: ProductFormValues,
): Promise<string> {
  const ref = await addDoc(getProductsRef(db), {
    name: data.name,
    description: data.description || '',
    sku: data.sku,
    hsCode: data.hsCode,
    concentration: data.concentration || '',
    price: data.price,
    inventory: data.inventory ?? 0,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Partially update an existing product. Always bumps `updatedAt`.
 */
export async function updateProduct(
  db: Firestore,
  productId: string,
  data: Partial<Omit<Product, 'id' | 'createdAt'>>,
): Promise<void> {
  const productRef = getProductRef(db, productId);
  await updateDoc(productRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-delete a product by marking it inactive and recording removal time.
 */
export async function softDeleteProduct(
  db: Firestore,
  productId: string,
): Promise<void> {
  const productRef = getProductRef(db, productId);
  await updateDoc(productRef, {
    active: false,
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Fetch a single product by ID. Returns `null` if not found.
 */
export async function getProductById(
  db: Firestore,
  productId: string,
): Promise<(Product & { id: string }) | null> {
  const snap = await getDoc(getProductRef(db, productId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Product & { id: string };
}

/**
 * Return a query for all active products ordered by name.
 */
export function getActiveProductsQuery(db: Firestore, maxResults = 500): Query {
  return query(
    getProductsRef(db),
    where('active', '==', true),
    orderBy('name', 'asc'),
    limit(maxResults),
  );
}

// ---------------------------------------------------------------------------
// Stock CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new stock. The `code` field is auto-incremented by counting
 * existing stocks and adding 1 (a simple approach suitable for low-volume).
 *
 * @returns The auto-generated stock document ID.
 */
export async function createStock(
  db: Firestore,
  data: { name: string; description?: string },
): Promise<string> {
  // Determine the next code by counting existing stocks.
  const existingSnap = await getDocs(getStocksRef(db));
  const nextCode = existingSnap.size + 1;

  const ref = await addDoc(getStocksRef(db), {
    code: nextCode,
    name: data.name,
    description: data.description || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ---------------------------------------------------------------------------
// StockProduct CRUD
// ---------------------------------------------------------------------------

/**
 * Link a product to a stock with an initial quantity.
 *
 * @returns The auto-generated stockProduct document ID.
 */
export async function createStockProduct(
  db: Firestore,
  stockId: string,
  productId: string,
  quantity: number,
): Promise<string> {
  const ref = await addDoc(getStockProductsRef(db), {
    stockId,
    productId,
    quantity,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update the quantity of an existing stock-product link.
 */
export async function updateStockQuantity(
  db: Firestore,
  stockProductId: string,
  quantity: number,
): Promise<void> {
  const ref = getStockProductRef(db, stockProductId);
  await updateDoc(ref, {
    quantity,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Return a reactive query for stock-products at a given stock location.
 * Use with `useCollection<StockProduct>(query)` for real-time binding.
 */
export function getStockProductsByStockQuery(db: Firestore, stockId: string): Query {
  return query(getStockProductsRef(db), where('stockId', '==', stockId));
}

/**
 * Fetch all stock-products for a given stock.
 */
export async function getStockProductsByStock(
  db: Firestore,
  stockId: string,
): Promise<(StockProduct & { id: string })[]> {
  const q = query(getStockProductsRef(db), where('stockId', '==', stockId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StockProduct & { id: string });
}
