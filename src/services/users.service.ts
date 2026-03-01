import {
  collection, doc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, writeBatch,
  Firestore, Query,
} from 'firebase/firestore';
import type { User, UserProfile } from '@/types';

// ---------------------------------------------------------------------------
// Collection / document references
// ---------------------------------------------------------------------------

export function getUsersRef(db: Firestore) {
  return collection(db, 'users');
}

export function getUserRef(db: Firestore, userId: string) {
  return doc(db, 'users', userId);
}

export function getUserProfilesRef(db: Firestore, userId: string) {
  return collection(db, 'users', userId, 'profiles');
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Ensure a user document exists for the given Firebase Auth UID.
 *
 * Called on every login. If the user doc already exists the call is a no-op.
 * On first login it atomically creates the User document and a default
 * Profile sub-document, pre-populated with Caio's information.
 *
 * @returns true if a new user was created, false if it already existed.
 */
export async function ensureUser(
  db: Firestore,
  uid: string,
  email: string,
): Promise<boolean> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) return false;

  const batch = writeBatch(db);

  batch.set(userRef, {
    email,
    groupId: 'user',
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Profile defaults to Caio's information.
  const profileRef = doc(getUserProfilesRef(db, uid));
  batch.set(profileRef, {
    fullName: 'Caio Santos Abreu',
    email,
    sex: null,
    birthDate: null,
    state: '',
    city: '',
    address: '',
    documentNumber: '',
    postalCode: '',
    phone: '',
    userId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return true;
}

/**
 * Partially update an existing user document.
 * Always bumps `updatedAt`.
 */
export async function updateUser(
  db: Firestore,
  userId: string,
  data: Partial<Omit<User, 'id' | 'createdAt'>>,
): Promise<void> {
  const userRef = getUserRef(db, userId);
  await updateDoc(userRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-delete a user by marking them inactive and recording removal time.
 */
export async function softDeleteUser(
  db: Firestore,
  userId: string,
): Promise<void> {
  const userRef = getUserRef(db, userId);
  await updateDoc(userRef, {
    active: false,
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Return a Firestore query for active users in a specific group,
 * ordered by creation date descending.
 */
export function getUsersByGroupQuery(
  db: Firestore,
  groupId: string,
): Query {
  return query(
    getUsersRef(db),
    where('groupId', '==', groupId),
    where('active', '==', true),
    orderBy('createdAt', 'desc'),
  );
}

/**
 * Fetch a single user document by ID. Returns `null` if not found.
 */
export async function getUserById(
  db: Firestore,
  userId: string,
): Promise<(User & { id: string }) | null> {
  const snap = await getDoc(getUserRef(db, userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as User & { id: string };
}

/**
 * Fetch all profile documents for a given user.
 */
export async function getUserProfiles(
  db: Firestore,
  userId: string,
): Promise<(UserProfile & { id: string })[]> {
  const snap = await getDocs(getUserProfilesRef(db, userId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserProfile & { id: string });
}
