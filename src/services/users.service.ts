import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, writeBatch,
  Firestore, Query,
} from 'firebase/firestore';
import type { User, UserProfile, UserAddress, UserCreationFormValues } from '@/types';

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

export function getUserAddressesRef(db: Firestore, userId: string) {
  return collection(db, 'users', userId, 'addresses');
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Atomically create a User document and its initial Profile sub-document
 * inside a single Firestore batch write.
 *
 * @returns The auto-generated user ID.
 */
export async function createUser(
  db: Firestore,
  data: UserCreationFormValues & { groupId: string },
): Promise<string> {
  const batch = writeBatch(db);

  // Pre-generate the user document reference so we know the ID upfront.
  const userRef = doc(getUsersRef(db));
  const userId = userRef.id;

  batch.set(userRef, {
    document: data.document,
    groupId: data.groupId,
    active: true,
    status: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Profile lives in the users/{userId}/profiles subcollection.
  const profileRef = doc(getUserProfilesRef(db, userId));
  batch.set(profileRef, {
    firstName: data.firstName,
    lastName: data.lastName || '',
    fullName: `${data.firstName} ${data.lastName || ''}`.trim(),
    email: data.email,
    phone: data.phone || '',
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return userId;
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

/**
 * Add an address to a user's addresses subcollection.
 *
 * @returns The auto-generated address document ID.
 */
export async function createUserAddress(
  db: Firestore,
  userId: string,
  data: Omit<UserAddress, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(getUserAddressesRef(db, userId), {
    ...data,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
