import {
  collection, doc, addDoc, updateDoc, getDoc,
  query, where, orderBy, serverTimestamp,
  Firestore, Query,
} from 'firebase/firestore';
import type { Representante } from '@/types/representante';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getRepresentantesRef(db: Firestore) {
  return collection(db, 'representantes');
}

export function getRepresentanteRef(db: Firestore, representanteId: string) {
  return doc(db, 'representantes', representanteId);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new representante document in the `representantes` collection.
 * Returns the generated representante ID.
 */
export async function createRepresentante(
  db: Firestore,
  data: { name: string; code: string; email?: string; phone?: string; userId?: string },
): Promise<string> {
  const ref = await addDoc(getRepresentantesRef(db), {
    name: data.name,
    code: data.code.toUpperCase(),
    email: data.email || '',
    phone: data.phone || '',
    userId: data.userId || '',
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Partially update an existing representante document.
 */
export async function updateRepresentante(
  db: Firestore,
  representanteId: string,
  data: Partial<Omit<Representante, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(getRepresentanteRef(db, representanteId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-delete a representante: mark inactive and record removal time.
 */
export async function softDeleteRepresentante(
  db: Firestore,
  representanteId: string,
): Promise<void> {
  await updateDoc(getRepresentanteRef(db, representanteId), {
    active: false,
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Query for all active representantes ordered by name ascending.
 */
export function getActiveRepresentantesQuery(db: Firestore): Query {
  return query(
    getRepresentantesRef(db),
    where('active', '==', true),
    orderBy('name', 'asc'),
  );
}

/**
 * Fetch a single representante document by ID. Returns `null` if not found.
 */
export async function getRepresentanteById(
  db: Firestore,
  representanteId: string,
): Promise<(Representante & { id: string }) | null> {
  const snap = await getDoc(getRepresentanteRef(db, representanteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Representante & { id: string };
}
