import {
  collection, doc, addDoc, updateDoc, getDoc,
  query, where, orderBy, serverTimestamp, Timestamp,
  Firestore, Query,
} from 'firebase/firestore';
import type { Client } from '@/types/client';
import type { CustomerFormValues } from '@/types/forms';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getClientsRef(db: Firestore) {
  return collection(db, 'clients');
}

export function getClientRef(db: Firestore, clientId: string) {
  return doc(db, 'clients', clientId);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new client document in the `clients` collection.
 * Returns the generated client ID.
 */
export async function createClient(
  db: Firestore,
  data: CustomerFormValues,
): Promise<string> {
  const ref = await addDoc(getClientsRef(db), {
    document: data.document,
    firstName: data.firstName,
    lastName: data.lastName || '',
    fullName: `${data.firstName} ${data.lastName || ''}`.trim(),
    email: data.email || '',
    phone: data.phone || '',
    birthDate: data.birthDate ? Timestamp.fromDate(data.birthDate) : null,
    sex: data.sex || null,
    motherName: data.motherName || '',
    representativeId: data.representativeId || '',
    address: data.address || null,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Partially update an existing client document.
 */
export async function updateClient(
  db: Firestore,
  clientId: string,
  data: Partial<Omit<Client, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(getClientRef(db, clientId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-delete a client: mark inactive and record removal time.
 */
export async function softDeleteClient(
  db: Firestore,
  clientId: string,
): Promise<void> {
  await updateDoc(getClientRef(db, clientId), {
    active: false,
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Query for all active clients ordered by full name ascending.
 */
export function getActiveClientsQuery(db: Firestore): Query {
  return query(
    getClientsRef(db),
    where('active', '==', true),
    orderBy('fullName', 'asc'),
  );
}

/**
 * Fetch a single client document by ID. Returns `null` if not found.
 */
export async function getClientById(
  db: Firestore,
  clientId: string,
): Promise<(Client & { id: string }) | null> {
  const snap = await getDoc(getClientRef(db, clientId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Client & { id: string };
}
