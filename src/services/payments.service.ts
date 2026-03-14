import {
  collection, collectionGroup, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, Firestore, Timestamp, Query,
} from 'firebase/firestore';
import type { Payment, PaymentLink } from '@/types';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getOrderPaymentsRef(db: Firestore, orderId: string) {
  return collection(db, 'orders', orderId, 'payments');
}

export function getOrderPaymentLinksRef(db: Firestore, orderId: string) {
  return collection(db, 'orders', orderId, 'paymentLinks');
}

// ---------------------------------------------------------------------------
// Payment link CRUD
// ---------------------------------------------------------------------------

/**
 * Create a payment link record inside an order's `paymentLinks` subcollection.
 *
 * @returns The auto-generated payment link document ID.
 */
export async function createPaymentLink(
  db: Firestore,
  orderId: string,
  data: {
    amount: number;
    currency: string;
    referenceId: string;
    paymentUrl: string;
    provider?: string;
    expiresAt?: Date;
    /** Denormalized metadata for Pagamentos list */
    doctorName?: string;
    repName?: string;
    invoice?: string;
    clientName?: string;
  },
): Promise<string> {
  const linksRef = getOrderPaymentLinksRef(db, orderId);
  const ref = await addDoc(linksRef, {
    status: 'created',
    currency: data.currency,
    amount: data.amount,
    referenceId: data.referenceId,
    paymentUrl: data.paymentUrl,
    provider: data.provider || '',
    feeForMerchant: false,
    installmentMerchant: 1,
    secretKey: '',
    orderId,
    expiresAt: data.expiresAt ? Timestamp.fromDate(data.expiresAt) : null,
    // Denormalized metadata
    ...(data.doctorName ? { doctorName: data.doctorName } : {}),
    ...(data.repName ? { repName: data.repName } : {}),
    ...(data.invoice ? { invoice: data.invoice } : {}),
    ...(data.clientName ? { clientName: data.clientName } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update the status of a payment link.
 */
export async function updatePaymentLinkStatus(
  db: Firestore,
  orderId: string,
  paymentLinkId: string,
  status: string,
): Promise<void> {
  const linkRef = doc(db, 'orders', orderId, 'paymentLinks', paymentLinkId);
  await updateDoc(linkRef, {
    status,
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Payment CRUD
// ---------------------------------------------------------------------------

/**
 * Create a payment record inside an order's `payments` subcollection.
 *
 * @returns The auto-generated payment document ID.
 */
export async function createPayment(
  db: Firestore,
  orderId: string,
  data: {
    provider: string;
    status: string;
    currency: string;
    amount: number;
    paymentLinkId: string;
    paymentId: string;
    paymentUrl: string;
  },
): Promise<string> {
  const paymentsRef = getOrderPaymentsRef(db, orderId);
  const ref = await addDoc(paymentsRef, {
    provider: data.provider,
    status: data.status,
    currency: data.currency,
    amount: data.amount,
    paymentLinkId: data.paymentLinkId,
    paymentId: data.paymentId,
    paymentUrl: data.paymentUrl,
    orderId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update the status (and optionally the payment date) of an existing payment.
 */
export async function updatePaymentStatus(
  db: Firestore,
  orderId: string,
  paymentId: string,
  status: string,
  paymentDate?: Date,
): Promise<void> {
  const paymentRef = doc(db, 'orders', orderId, 'payments', paymentId);
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };

  if (paymentDate) {
    updateData.paymentDate = Timestamp.fromDate(paymentDate);
  }

  await updateDoc(paymentRef, updateData);
}

// ---------------------------------------------------------------------------
// Payment reads
// ---------------------------------------------------------------------------

/**
 * Fetch all payments for a given order.
 */
export async function getOrderPayments(
  db: Firestore,
  orderId: string,
): Promise<(Payment & { id: string })[]> {
  const snap = await getDocs(getOrderPaymentsRef(db, orderId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Payment & { id: string });
}

/**
 * Fetch all payment links for a given order.
 */
export async function getOrderPaymentLinks(
  db: Firestore,
  orderId: string,
): Promise<(PaymentLink & { id: string })[]> {
  const snap = await getDocs(getOrderPaymentLinksRef(db, orderId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentLink & { id: string });
}

/**
 * Fetch a single payment by its ID within an order.
 * Returns `null` if not found.
 */
export async function getPaymentById(
  db: Firestore,
  orderId: string,
  paymentId: string,
): Promise<(Payment & { id: string }) | null> {
  const ref = doc(db, 'orders', orderId, 'payments', paymentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Payment & { id: string };
}

// ---------------------------------------------------------------------------
// Collection group queries (for Pagamentos page)
// ---------------------------------------------------------------------------

/**
 * Query all payment links across all orders, ordered by creation date (newest first).
 */
export function getAllPaymentLinksQuery(db: Firestore): Query {
  return query(
    collectionGroup(db, 'paymentLinks'),
    orderBy('createdAt', 'desc'),
  );
}

/**
 * Query unassigned (standalone) payment links from the top-level collection.
 * Only returns active links (status = 'created') sorted newest first.
 */
export function getUnassignedPaymentLinksQuery(db: Firestore): Query {
  return query(
    collection(db, 'paymentLinks'),
    where('orderId', '==', ''),
    where('status', '==', 'created'),
    orderBy('createdAt', 'desc'),
  );
}
