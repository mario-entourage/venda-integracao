import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, serverTimestamp, Firestore,
} from 'firebase/firestore';
import type { DocumentRecord } from '@/types';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getDocumentsRef(db: Firestore) {
  return collection(db, 'documents');
}

export function getDocumentRef(db: Firestore, docId: string) {
  return doc(db, 'documents', docId);
}

// ---------------------------------------------------------------------------
// Document CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new document record in the top-level `documents` collection.
 *
 * @returns The auto-generated document record ID.
 */
export async function createDocumentRecord(
  db: Firestore,
  data: {
    type: string;
    holder: string;
    key: string;
    number: string;
    metadata?: Record<string, unknown>;
    userId?: string;
    orderId?: string;
  },
): Promise<string> {
  const ref = await addDoc(getDocumentsRef(db), {
    type: data.type,
    holder: data.holder,
    key: data.key,
    number: data.number,
    metadata: data.metadata || {},
    userId: data.userId || '',
    orderId: data.orderId || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Fetch a single document record by ID. Returns `null` if not found.
 */
export async function getDocumentRecordById(
  db: Firestore,
  docId: string,
): Promise<(DocumentRecord & { id: string }) | null> {
  const snap = await getDoc(getDocumentRef(db, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DocumentRecord & { id: string };
}

/**
 * Update an existing document record. Always bumps `updatedAt`.
 */
export async function updateDocumentRecord(
  db: Firestore,
  docId: string,
  data: Partial<Omit<DocumentRecord, 'id' | 'createdAt'>>,
): Promise<void> {
  const ref = getDocumentRef(db, docId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Order document requests (subcollection of orders)
// ---------------------------------------------------------------------------

/**
 * Create a document request inside an order's `documentRequests` subcollection.
 * These represent documents that must be uploaded / provided before the order
 * can proceed.
 *
 * @returns The auto-generated document request ID.
 */
export async function createOrderDocumentRequest(
  db: Firestore,
  orderId: string,
  documentType: string,
): Promise<string> {
  const requestsRef = collection(db, 'orders', orderId, 'documentRequests');
  const ref = await addDoc(requestsRef, {
    orderId,
    documentType,
    status: 'pending',
    requestedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update the status of a document request.
 * When the status is anything other than `pending`, sets `receivedAt`.
 * Optionally links the uploaded document via `documentId`.
 */
export async function updateDocumentRequestStatus(
  db: Firestore,
  orderId: string,
  requestId: string,
  status: string,
  documentId?: string,
): Promise<void> {
  const requestRef = doc(db, 'orders', orderId, 'documentRequests', requestId);
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };

  if (status !== 'pending') {
    updateData.receivedAt = serverTimestamp();
  }

  if (documentId) {
    updateData.documentId = documentId;
  }

  await updateDoc(requestRef, updateData);
}

/**
 * Fetch all document requests for a given order.
 */
export async function getOrderDocumentRequests(
  db: Firestore,
  orderId: string,
): Promise<Array<{ id: string } & Record<string, unknown>>> {
  const requestsRef = collection(db, 'orders', orderId, 'documentRequests');
  const snap = await getDocs(requestsRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch all documents linked to a specific user.
 */
export async function getDocumentsByUser(
  db: Firestore,
  userId: string,
): Promise<(DocumentRecord & { id: string })[]> {
  const q = query(getDocumentsRef(db), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DocumentRecord & { id: string });
}
