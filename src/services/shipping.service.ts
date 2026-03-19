import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  Firestore,
  query,
  limit,
  where,
} from 'firebase/firestore';
import type { ShippingRecord, ShippingMethod } from '@/types/shipping';
import { getOrderSubcollectionRef, updateOrderStatus } from './orders.service';

// ---------------------------------------------------------------------------
// Shipping record CRUD
// ---------------------------------------------------------------------------

/**
 * Save (create or update) a shipping record for an order.
 *
 * - If a shipping document already exists for the order, updates it.
 * - If none exists, creates a new shipping document.
 * - Always updates the order status to 'shipped'.
 */
export async function saveShippingRecord(
  db: Firestore,
  orderId: string,
  record: Partial<Omit<ShippingRecord, 'id' | 'createdAt' | 'updatedAt'>>,
  updatedById: string,
): Promise<void> {
  const shippingRef = getOrderSubcollectionRef(db, orderId, 'shipping');

  // Check if a shipping document already exists
  const existingSnap = await getDocs(query(shippingRef, limit(1)));

  const payload = {
    ...record,
    orderId,
    updatedAt: serverTimestamp(),
  };

  if (!existingSnap.empty) {
    // Update the existing shipping document
    const existingDocRef = existingSnap.docs[0].ref;
    await updateDoc(existingDocRef, payload);
  } else {
    // Create a new shipping document
    await addDoc(shippingRef, {
      ...payload,
      tracking: record.tracking ?? '',
      price: record.price ?? 0,
      insurance: record.insurance ?? false,
      insuranceValue: record.insuranceValue ?? 0,
      createdAt: serverTimestamp(),
    });
  }

  // Update parent order status to 'shipped'
  await updateOrderStatus(db, orderId, 'shipped', updatedById);
}

/**
 * Retrieve the first (most recent) shipping record for an order.
 * Returns null if no shipping document exists.
 */
export async function getShippingRecord(
  db: Firestore,
  orderId: string,
): Promise<(ShippingRecord & { id: string }) | null> {
  const shippingRef = getOrderSubcollectionRef(db, orderId, 'shipping');
  const snap = await getDocs(query(shippingRef, limit(1)));

  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as ShippingRecord & { id: string };
}

/**
 * Deduct inventory for all products in an order from the correct stock location.
 *
 * - TRISTAR  → stock whose name contains "miami"
 * - LOCAL_MAIL → stock whose name contains "brasil"
 * - OTHER / MOTOBOY → no deduction
 */
export async function deductInventoryOnShip(
  db: Firestore,
  orderId: string,
  method: ShippingMethod,
): Promise<void> {
  if (method === 'OTHER' || method === 'MOTOBOY') return;

  const nameFragment = method === 'TRISTAR' ? 'miami' : 'brasil';

  // Find the target stock by name pattern
  const stocksSnap = await getDocs(collection(db, 'stocks'));
  const targetStock = stocksSnap.docs.find((d) =>
    String(d.data().name ?? '').toLowerCase().includes(nameFragment),
  );
  if (!targetStock) {
    console.warn(`[deductInventoryOnShip] No stock found for method=${method} (looking for "${nameFragment}")`);
    return;
  }
  const stockId = targetStock.id;

  // Get order products
  const productsSnap = await getDocs(getOrderSubcollectionRef(db, orderId, 'products'));
  if (productsSnap.empty) return;

  for (const productDoc of productsSnap.docs) {
    const { stockProductId, quantity } = productDoc.data() as { stockProductId?: string; quantity?: number };
    if (!stockProductId || !quantity) continue;

    // Find the stockProducts document that links this product to the stock
    const spSnap = await getDocs(
      query(
        collection(db, 'stockProducts'),
        where('stockId', '==', stockId),
        where('productId', '==', stockProductId),
        limit(1),
      ),
    );
    if (spSnap.empty) {
      console.warn(`[deductInventoryOnShip] stockProduct not found: stockId=${stockId} productId=${stockProductId}`);
      continue;
    }

    const spDoc = spSnap.docs[0];
    const currentQty: number = (spDoc.data().quantity as number) ?? 0;
    const newQty = Math.max(0, currentQty - quantity);

    await updateDoc(spDoc.ref, { quantity: newQty, updatedAt: serverTimestamp() });
  }
}

/**
 * Update just the TriStar status on an existing shipping record.
 * Used after confirming or tracking a TriStar shipment.
 */
export async function updateTriStarShipmentStatus(
  db: Firestore,
  orderId: string,
  tristarStatus: number,
): Promise<void> {
  const shippingRef = getOrderSubcollectionRef(db, orderId, 'shipping');
  const snap = await getDocs(query(shippingRef, limit(1)));

  if (snap.empty) return;

  await updateDoc(snap.docs[0].ref, {
    tristarStatus,
    updatedAt: serverTimestamp(),
  });
}
