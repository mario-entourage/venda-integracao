import {
  collection, doc, updateDoc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch,
  Firestore, Query,
} from 'firebase/firestore';
import type { User, UserProfile } from '@/types';

// ---------------------------------------------------------------------------
// Pre-registration collection (keyed by email)
// ---------------------------------------------------------------------------

export interface Preregistration {
  email: string;
  groupId: string;
  createdAt: unknown; // Firestore Timestamp
}

export function getPreregistrationsRef(db: Firestore) {
  return collection(db, 'preregistrations');
}

export function getPreregistrationRef(db: Firestore, email: string) {
  // Use encoded email as doc ID (replace @ and . to keep valid)
  const docId = email.replace(/[.@]/g, '_');
  return doc(db, 'preregistrations', docId);
}

/**
 * Create or overwrite a pre-registration entry so the user gets the given
 * groupId when they first log in via Google OAuth.
 */
export async function createPreregistration(
  db: Firestore,
  email: string,
  groupId: string,
): Promise<void> {
  await setDoc(getPreregistrationRef(db, email), {
    email,
    groupId,
    createdAt: serverTimestamp(),
  });
}

/**
 * Fetch all pending pre-registrations.
 */
export async function getPreregistrations(
  db: Firestore,
): Promise<(Preregistration & { id: string })[]> {
  const snap = await getDocs(getPreregistrationsRef(db));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Preregistration & { id: string });
}

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

  if (snap.exists()) {
    // Always update lastLogin + backfill active flag on every sign-in
    const data = snap.data();
    const updates: Record<string, unknown> = { lastLogin: serverTimestamp() };
    if (data.active !== true) updates.active = true;
    await updateDoc(userRef, updates);
    return false;
  }

  // Check if there is a pre-registration for this email
  const preregRef = getPreregistrationRef(db, email);
  const preregSnap = await getDoc(preregRef);
  const groupId = preregSnap.exists()
    ? (preregSnap.data() as Preregistration).groupId
    : 'user';

  const batch = writeBatch(db);

  batch.set(userRef, {
    email,
    groupId,
    active: true,
    lastLogin: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Consume the pre-registration if it existed
  if (preregSnap.exists()) {
    batch.delete(preregRef);
  }

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
 * Return a Firestore query for all active users, ordered by email ascending.
 */
export function getActiveUsersQuery(db: Firestore): Query {
  return query(
    getUsersRef(db),
    where('active', '==', true),
    orderBy('email', 'asc'),
  );
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
