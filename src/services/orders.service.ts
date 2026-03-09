import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, writeBatch,
  Firestore, Query, Timestamp,
} from 'firebase/firestore';
import type {
  Order, OrderCustomer, OrderRepresentative, OrderDoctor,
  OrderProduct, OrderShipping, ShippingAddress,
} from '@/types';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getOrdersRef(db: Firestore) {
  return collection(db, 'orders');
}

export function getOrderRef(db: Firestore, orderId: string) {
  return doc(db, 'orders', orderId);
}

export function getOrderSubcollectionRef(
  db: Firestore,
  orderId: string,
  subcollection:
    | 'customer'
    | 'representative'
    | 'doctor'
    | 'products'
    | 'shipping'
    | 'documents'
    | 'documentRequests'
    | 'payments'
    | 'paymentLinks',
) {
  return collection(db, 'orders', orderId, subcollection);
}

// ---------------------------------------------------------------------------
// Order creation (atomic batch write)
// ---------------------------------------------------------------------------

export interface CreateOrderData {
  customer: { name: string; document: string; userId: string };
  representative: { name: string; userId: string };
  doctor: { name: string; crm: string; userId: string };
  products: Array<{
    stockProductId: string;
    quantity: number;
    price: number;
    discount: number;
    productName: string;
  }>;
  currency?: string;
  discount?: number;
  /** Pre-calculated total in the order's currency. If provided, skips server-side recalculation. */
  amountOverride?: number;
  /** PTAX midpoint exchange rate (BRL per 1 USD) at order creation time */
  exchangeRate?: number;
  /** Date the PTAX rate was quoted (YYYY-MM-DD) */
  exchangeRateDate?: string;
  legalGuardian?: boolean;
  anvisaOption?: string;
  type?: string;
  shippingAddress?: ShippingAddress;
  prescriptionDocId?: string;
  /** SHA-256 hex hash of the prescription file (for duplicate detection) */
  prescriptionHash?: string;
  allowedPaymentMethods?: {
    creditCard: boolean;
    debitCard: boolean;
    boleto: boolean;
    pix: boolean;
  };
}

/**
 * Create a full order in a single atomic Firestore batch write.
 *
 * This writes:
 *  - The root `orders/{orderId}` document
 *  - `orders/{orderId}/customer/{auto}` subcollection doc
 *  - `orders/{orderId}/representative/{auto}` subcollection doc
 *  - `orders/{orderId}/doctor/{auto}` subcollection doc
 *  - `orders/{orderId}/products/{auto}` docs (one per line item)
 *  - `orders/{orderId}/shipping/{auto}` (if a shipping address is provided)
 *
 * @returns The pre-generated order document ID.
 */
export async function createOrder(
  db: Firestore,
  orderData: CreateOrderData,
  createdById: string,
): Promise<string> {
  // Phase 1 -- Pre-generate the order ID so every subcollection can reference it.
  const orderId = doc(collection(db, 'orders')).id;

  // Phase 2 -- Calculate the order total.
  // If the caller pre-computed the BRL total (using an exchange rate), use it directly.
  const amount = orderData.amountOverride ?? orderData.products.reduce((sum, p) => {
    const lineTotal = p.price * p.quantity * (1 - (p.discount || 0) / 100);
    return sum + lineTotal;
  }, 0);

  // Phase 3 -- Build the batch.
  const batch = writeBatch(db);

  // --- Order root document ---------------------------------------------------
  batch.set(doc(db, 'orders', orderId), {
    status: 'pending',
    invoice: '',
    type: orderData.type || 'sale',
    currency: orderData.currency || 'BRL',
    amount,
    discount: orderData.discount || 0,
    legalGuardian: orderData.legalGuardian || false,
    anvisaOption: orderData.anvisaOption || '',
    anvisaStatus: '',
    anvisaRequestId: '',
    zapsignDocId: '',
    zapsignStatus: '',
    exchangeRate: orderData.exchangeRate || null,
    exchangeRateDate: orderData.exchangeRateDate || null,
    documentsComplete: false,
    tristarShipmentId: '',
    prescriptionDocId: orderData.prescriptionDocId || '',
    prescriptionHash: orderData.prescriptionHash || '',
    ...(orderData.allowedPaymentMethods && { allowedPaymentMethods: orderData.allowedPaymentMethods }),
    createdById,
    updatedById: createdById,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // --- Customer subcollection ------------------------------------------------
  batch.set(doc(collection(db, 'orders', orderId, 'customer')), {
    name: orderData.customer.name,
    document: orderData.customer.document,
    userId: orderData.customer.userId,
    orderId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // --- Representative subcollection ------------------------------------------
  batch.set(doc(collection(db, 'orders', orderId, 'representative')), {
    name: orderData.representative.name,
    saleId: orderId,
    userId: orderData.representative.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // --- Doctor subcollection --------------------------------------------------
  batch.set(doc(collection(db, 'orders', orderId, 'doctor')), {
    name: orderData.doctor.name,
    crm: orderData.doctor.crm,
    userId: orderData.doctor.userId,
    orderId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // --- Products subcollection ------------------------------------------------
  for (const product of orderData.products) {
    batch.set(doc(collection(db, 'orders', orderId, 'products')), {
      stockProductId: product.stockProductId,
      quantity: product.quantity,
      price: product.price,
      discount: product.discount || 0,
      productName: product.productName,
      orderId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // --- Shipping subcollection (optional) -------------------------------------
  if (orderData.shippingAddress) {
    batch.set(doc(collection(db, 'orders', orderId, 'shipping')), {
      tracking: '',
      price: 0,
      insurance: false,
      insuranceValue: 0,
      orderId,
      address: orderData.shippingAddress,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Phase 4 -- Commit everything atomically.
  await batch.commit();
  return orderId;
}

// ---------------------------------------------------------------------------
// Order updates
// ---------------------------------------------------------------------------

/**
 * Update the status of an order and record who made the change.
 */
export async function updateOrderStatus(
  db: Firestore,
  orderId: string,
  status: string,
  updatedById: string,
): Promise<void> {
  const orderRef = getOrderRef(db, orderId);
  await updateDoc(orderRef, {
    status,
    updatedById,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Partially update an order document. Always bumps `updatedAt`.
 */
export async function updateOrder(
  db: Firestore,
  orderId: string,
  data: Partial<Omit<Order, 'id' | 'createdAt' | 'createdById'>>,
): Promise<void> {
  const orderRef = getOrderRef(db, orderId);
  await updateDoc(orderRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Order queries
// ---------------------------------------------------------------------------

/**
 * Build a Firestore query for orders.
 * Optionally filter by status; always ordered by creation date descending.
 */
export function getOrdersQuery(db: Firestore, status?: string): Query {
  const constraints = [orderBy('createdAt', 'desc')];

  if (status) {
    return query(
      getOrdersRef(db),
      where('status', '==', status),
      ...constraints,
    );
  }

  return query(getOrdersRef(db), ...constraints);
}

/**
 * Build a Firestore query for orders created within a date range.
 * Used by the Controle module for date-filtered views.
 */
export function getOrdersByDateRangeQuery(
  db: Firestore,
  from: Date,
  to: Date,
): Query {
  return query(
    getOrdersRef(db),
    where('createdAt', '>=', Timestamp.fromDate(from)),
    where('createdAt', '<=', Timestamp.fromDate(to)),
    orderBy('createdAt', 'desc'),
  );
}

/**
 * Return orders created by a specific user, ordered by creation date desc.
 */
export function getOrdersByCreatorQuery(db: Firestore, createdById: string): Query {
  return query(
    getOrdersRef(db),
    where('createdById', '==', createdById),
    orderBy('createdAt', 'desc'),
  );
}

/**
 * Return orders eligible for linking to an ANVISA Solicitação:
 * - has a prescription uploaded
 * - no ANVISA request linked yet
 * - not ANVISA-exempt
 * - not cancelled or soft-deleted
 */
export function getAnvisaEligibleOrdersQuery(db: Firestore): Query {
  return query(
    getOrdersRef(db),
    where('prescriptionDocId', '!=', ''),
    orderBy('createdAt', 'desc'),
  );
}

/**
 * Find an active (non-cancelled, non-soft-deleted) order that has the same
 * prescription file hash.  Returns the first match, or `null` if none.
 */
export async function findActiveOrderByPrescriptionHash(
  db: Firestore,
  hash: string,
): Promise<(Order & { id: string }) | null> {
  if (!hash) return null;
  const q = query(getOrdersRef(db), where('prescriptionHash', '==', hash));
  const snap = await getDocs(q);
  const match = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Order & { id: string }))
    .find((o) => o.status !== 'cancelled' && !o.softDeleted);
  return match ?? null;
}

// ---------------------------------------------------------------------------
// Order reads
// ---------------------------------------------------------------------------

/**
 * Fetch a single order document by ID. Returns `null` if not found.
 */
export async function getOrderById(
  db: Firestore,
  orderId: string,
): Promise<(Order & { id: string }) | null> {
  const snap = await getDoc(getOrderRef(db, orderId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Order & { id: string };
}

/**
 * Fetch all documents in an order subcollection (e.g. products, shipping).
 */
export async function getOrderSubcollectionDocs<T>(
  db: Firestore,
  orderId: string,
  subcollection: Parameters<typeof getOrderSubcollectionRef>[2],
): Promise<(T & { id: string })[]> {
  const ref = getOrderSubcollectionRef(db, orderId, subcollection);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T & { id: string });
}

/**
 * Update the representative subcollection document for an existing order.
 * Modifies the first (and typically only) document in the subcollection.
 */
export async function updateOrderRepresentative(
  db: Firestore,
  orderId: string,
  representative: { name: string; userId: string },
): Promise<void> {
  const repRef = collection(db, 'orders', orderId, 'representative');
  const snap = await getDocs(repRef);
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      name: representative.name,
      userId: representative.userId,
      updatedAt: serverTimestamp(),
    });
  }
}
