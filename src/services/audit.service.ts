import {
  collection, doc, addDoc, updateDoc, getDocs, getDoc,
  query, where, orderBy, limit, serverTimestamp, arrayUnion,
  Firestore, Timestamp,
} from 'firebase/firestore';
import type { AuditSession, AuditSessionStatus, ModuleKey } from '@/types/audit';

// ---------------------------------------------------------------------------
// Collection reference
// ---------------------------------------------------------------------------

function getAuditSessionsRef(db: Firestore) {
  return collection(db, 'audit_sessions');
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createAuditSession(
  db: Firestore,
  data: {
    creatingUserId: string;
    creatingUserEmail: string;
    auditorEmail: string;
    expiresAt: Date;
  },
): Promise<string> {
  const docRef = await addDoc(getAuditSessionsRef(db), {
    creatingUserId: data.creatingUserId,
    creatingUserEmail: data.creatingUserEmail,
    auditorEmail: data.auditorEmail,
    status: 'pending' as AuditSessionStatus,
    expiresAt: Timestamp.fromDate(data.expiresAt),
    startedAt: null,
    endedAt: null,
    modulesVisited: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get the most recent pending or active audit session created by this admin.
 * Returns null if none found.
 */
export async function getActiveSessionForUser(
  db: Firestore,
  userId: string,
): Promise<AuditSession | null> {
  const q = query(
    getAuditSessionsRef(db),
    where('creatingUserId', '==', userId),
    where('status', 'in', ['pending', 'active']),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { ...d.data(), id: d.id } as AuditSession;
}

export async function getAuditSessionById(
  db: Firestore,
  sessionId: string,
): Promise<AuditSession | null> {
  const d = await getDoc(doc(db, 'audit_sessions', sessionId));
  if (!d.exists()) return null;
  return { ...d.data(), id: d.id } as AuditSession;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function activateAuditSession(
  db: Firestore,
  sessionId: string,
): Promise<void> {
  await updateDoc(doc(db, 'audit_sessions', sessionId), {
    status: 'active' as AuditSessionStatus,
    startedAt: serverTimestamp(),
  });
}

export async function endAuditSession(
  db: Firestore,
  sessionId: string,
  reason: 'signed_out' | 'expired',
): Promise<void> {
  await updateDoc(doc(db, 'audit_sessions', sessionId), {
    status: reason,
    endedAt: serverTimestamp(),
  });
}

export async function addModuleVisit(
  db: Firestore,
  sessionId: string,
  moduleKey: ModuleKey,
): Promise<void> {
  await updateDoc(doc(db, 'audit_sessions', sessionId), {
    modulesVisited: arrayUnion(moduleKey),
  });
}
