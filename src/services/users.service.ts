import {
  collection, doc, updateDoc, getDoc, getDocs, setDoc,
  query, where, orderBy, limit, serverTimestamp, writeBatch,
  Firestore, Query,
} from 'firebase/firestore';
import type { User, UserProfile } from '@/types';
import { ANVISA_COLLECTIONS } from '@/lib/anvisa-paths';
import { writeAuditLog } from './audit.service';

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
  performedById: string,
  options?: { isRepresentante?: boolean; displayName?: string },
): Promise<void> {
  const ref = getPreregistrationRef(db, email);
  await setDoc(ref, {
    email,
    groupId,
    ...(options?.isRepresentante ? { isRepresentante: true } : {}),
    ...(options?.displayName ? { displayName: options.displayName } : {}),
    createdAt: serverTimestamp(),
  });
  await writeAuditLog(db, { action: 'create', collection: 'preregistrations', documentId: ref.id, performedById, changes: { email, groupId, ...options } });
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
  displayName?: string,
): Promise<boolean> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    // Always update lastLogin + backfill active flag + displayName on every sign-in
    const data = snap.data();
    const updates: Record<string, unknown> = { lastLogin: serverTimestamp() };
    if (data.active !== true) updates.active = true;
    if (displayName && !data.displayName) updates.displayName = displayName;
    await updateDoc(userRef, updates);
    return false;
  }

  // Check if there is a pre-registration for this email
  const preregRef = getPreregistrationRef(db, email);
  const preregSnap = await getDoc(preregRef);
  const preregData = preregSnap.exists() ? preregSnap.data() as Record<string, unknown> : null;
  const groupId = preregData?.groupId as string || 'user';

  const batch = writeBatch(db);

  batch.set(userRef, {
    email,
    groupId,
    displayName: displayName || '',
    isRepresentante: preregData?.isRepresentante === true ? true : false,
    active: true,
    lastLogin: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Consume the pre-registration if it existed
  if (preregSnap.exists()) {
    batch.delete(preregRef);
  }

  // Profile
  const profileRef = doc(getUserProfilesRef(db, uid));
  batch.set(profileRef, {
    fullName: displayName || email,
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

  // Auto-create ANVISA solicitante profile from the default (Caio's) profile.
  // Done after the main batch so a read-then-write is safe.
  try {
    const defaultPointerRef = doc(db, ANVISA_COLLECTIONS.defaultProfile, 'current');
    const defaultPointerSnap = await getDoc(defaultPointerRef);
    if (defaultPointerSnap.exists()) {
      const sourceUid = (defaultPointerSnap.data() as { userId?: string }).userId;
      if (sourceUid) {
        const sourceProfileRef = doc(db, ANVISA_COLLECTIONS.userProfiles, sourceUid);
        const sourceSnap = await getDoc(sourceProfileRef);
        if (sourceSnap.exists()) {
          const anvisaProfileRef = doc(db, ANVISA_COLLECTIONS.userProfiles, uid);
          await setDoc(anvisaProfileRef, sourceSnap.data()!);
        }
      }
    }
  } catch (err) {
    // Non-fatal — the user can still fill it manually via /anvisa/perfil
    console.warn('[ensureUser] Failed to auto-create ANVISA profile:', err);
  }

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
  performedById: string,
): Promise<void> {
  const userRef = getUserRef(db, userId);
  await updateDoc(userRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog(db, { action: 'update', collection: 'users', documentId: userId, performedById, changes: data as unknown as Record<string, unknown> });
}

/**
 * Soft-delete a user by marking them inactive and recording removal time.
 */
export async function softDeleteUser(
  db: Firestore,
  userId: string,
  performedById: string,
): Promise<void> {
  const userRef = getUserRef(db, userId);
  await updateDoc(userRef, {
    active: false,
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog(db, { action: 'soft_delete', collection: 'users', documentId: userId, performedById, changes: { active: false } });
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

// ---------------------------------------------------------------------------
// Sales rep (representante) queries
// ---------------------------------------------------------------------------

/**
 * Return a Firestore query for all active users who are sales reps.
 */
export function getActiveRepUsersQuery(db: Firestore, maxResults = 200): Query {
  return query(
    getUsersRef(db),
    where('isRepresentante', '==', true),
    where('active', '==', true),
    orderBy('displayName', 'asc'),
    limit(maxResults),
  );
}

/**
 * Get a user's display name by ID (for rep name lookups).
 */
export async function getUserDisplayName(
  db: Firestore,
  userId: string,
): Promise<string> {
  const user = await getUserById(db, userId);
  if (user?.displayName) return user.displayName;
  // Fallback to profile
  const profiles = await getUserProfiles(db, userId);
  return profiles[0]?.fullName || user?.email || '';
}
