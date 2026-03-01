import {
  collection, doc, addDoc, updateDoc, getDoc,
  query, where, orderBy, serverTimestamp,
  Firestore, Query,
} from 'firebase/firestore';
import type { Doctor } from '@/types/doctor';
import type { DoctorFormValues } from '@/types/forms';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getDoctorsRef(db: Firestore) {
  return collection(db, 'doctors');
}

export function getDoctorRef(db: Firestore, doctorId: string) {
  return doc(db, 'doctors', doctorId);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new doctor document in the `doctors` collection.
 * Returns the generated doctor ID.
 */
export async function createDoctor(
  db: Firestore,
  data: DoctorFormValues,
): Promise<string> {
  const ref = await addDoc(getDoctorsRef(db), {
    firstName: data.firstName,
    lastName: data.lastName || '',
    fullName: `${data.firstName} ${data.lastName || ''}`.trim(),
    email: data.email || '',
    crm: data.crm,
    mainSpecialty: data.mainSpecialty || '',
    state: data.state || '',
    city: data.city || '',
    phone: data.phone || '',
    mobilePhone: data.mobilePhone || '',
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Partially update an existing doctor document.
 */
export async function updateDoctor(
  db: Firestore,
  doctorId: string,
  data: Partial<Omit<Doctor, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(getDoctorRef(db, doctorId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-delete a doctor: mark inactive and record removal time.
 */
export async function softDeleteDoctor(
  db: Firestore,
  doctorId: string,
): Promise<void> {
  await updateDoc(getDoctorRef(db, doctorId), {
    active: false,
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Query for all active doctors ordered by full name ascending.
 */
export function getActiveDoctorsQuery(db: Firestore): Query {
  return query(
    getDoctorsRef(db),
    where('active', '==', true),
    orderBy('fullName', 'asc'),
  );
}

/**
 * Fetch a single doctor document by ID. Returns `null` if not found.
 */
export async function getDoctorById(
  db: Firestore,
  doctorId: string,
): Promise<(Doctor & { id: string }) | null> {
  const snap = await getDoc(getDoctorRef(db, doctorId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Doctor & { id: string };
}
