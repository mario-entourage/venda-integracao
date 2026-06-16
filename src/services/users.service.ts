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
 * Fold any *other* user docs that share this email into the canonical,
 * UID-keyed user doc.
 *
 * This handles the case where an admin designates a sales rep without a login
 * (the external-rep flow writes a `users` doc with a random ID) and that rep
 * later signs in — which would otherwise create a *second* user doc and a
 * duplicate entry in every rep dropdown. We re-point `doctors.repUserId` from
 * the old doc to the canonical UID and deactivate the old doc, leaving a
 * `mergedIntoUid` pointer so historical order credit still resolves (the
 * commissions API follows it). Also cleans up a stale duplicate left behind by
 * a previous login.
 *
 * Best-effort: never throws — a login must not fail because a merge hiccuped.
 *
 * @returns rep attributes to carry onto the canonical doc.
 */
async function mergeDuplicateRepUsers(
  db: Firestore,
  uid: string,
  email: string,
): Promise<{ isRepresentante: boolean; state?: string; displayName?: string }> {
  const carried: { isRepresentante: boolean; state?: string; displayName?: string } = {
    isRepresentante: false,
  };
  try {
    const dupSnap = await getDocs(query(getUsersRef(db), where('email', '==', email)));
    for (const dup of dupSnap.docs) {
      if (dup.id === uid) continue;
      const data = dup.data() as Record<string, unknown>;
      if (data.mergedIntoUid) continue; // already folded in by a prior login

      if (data.isRepresentante === true) carried.isRepresentante = true;
      if (!carried.state && typeof data.state === 'string' && data.state) carried.state = data.state;
      if (!carried.displayName && typeof data.displayName === 'string' && data.displayName) {
        carried.displayName = data.displayName;
      }

      const batch = writeBatch(db);
      // Re-point doctor assignments from the old rep id to the canonical UID.
      const assigned = await getDocs(query(collection(db, 'doctors'), where('repUserId', '==', dup.id)));
      for (const docDoc of assigned.docs) {
        batch.update(docDoc.ref, { repUserId: uid, updatedAt: serverTimestamp() });
      }
      // Deactivate the duplicate and point it at the survivor.
      batch.update(dup.ref, {
        active: false,
        isRepresentante: false,
        mergedIntoUid: uid,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[ensureUser] rep merge skipped:', err);
  }
  return carried;
}

/**
 * Ensure a user document exists for the given Firebase Auth UID.
 *
 * Called on every login. If the user doc already exists the call is a no-op
 * (apart from rep-duplicate cleanup). On first login it atomically creates the
 * User document and a default Profile sub-document, pre-populated with Caio's
 * information.
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
    // Always update lastLogin + backfill active flag + displayName on every sign-in.
    // Also fold in any duplicate rep doc (e.g. an external-rep entry that
    // predates this login) and inherit its rep status.
    const data = snap.data();
    const merged = await mergeDuplicateRepUsers(db, uid, email);
    const updates: Record<string, unknown> = { lastLogin: serverTimestamp() };
    if (data.active !== true) updates.active = true;
    if (displayName && !data.displayName) updates.displayName = displayName;
    if (merged.isRepresentante && data.isRepresentante !== true) updates.isRepresentante = true;
    if (merged.state && !data.state) updates.state = merged.state;
    await updateDoc(userRef, updates);
    return false;
  }

  // Check if there is a pre-registration for this email
  const preregRef = getPreregistrationRef(db, email);
  const preregSnap = await getDoc(preregRef);
  const preregData = preregSnap.exists() ? preregSnap.data() as Record<string, unknown> : null;
  const groupId = preregData?.groupId as string || 'user';

  // Fold in any rep doc an admin created for this email without a login.
  const merged = await mergeDuplicateRepUsers(db, uid, email);

  const batch = writeBatch(db);

  batch.set(userRef, {
    email,
    groupId,
    displayName: displayName || merged.displayName || '',
    isRepresentante: preregData?.isRepresentante === true || merged.isRepresentante ? true : false,
    ...(merged.state ? { state: merged.state } : {}),
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
