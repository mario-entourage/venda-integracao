import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { requireAdmin } from '../_require-admin';

export const dynamic = 'force-dynamic';

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}

const DEV_EMAILS = ['dev-admin@entouragelab.com'];

export async function POST(request: NextRequest) {
  const auth_result = await requireAdmin(request);
  if (auth_result instanceof Response) return auth_result;
  console.log(`[cleanup-dev-users] Triggered by ${auth_result.email}`);

  try {
    const db = getFirestore();
    const auth = getAuth();
    const results: { email: string; collection: string; action: string }[] = [];

    for (const email of DEV_EMAILS) {
      // 1. Hard-delete from `preregistrations`
      const preregSnap = await db
        .collection('preregistrations')
        .where('email', '==', email)
        .get();

      for (const docRef of preregSnap.docs) {
        await docRef.ref.delete();
        results.push({ email, collection: 'preregistrations', action: 'deleted' });
      }
      if (preregSnap.empty) {
        results.push({ email, collection: 'preregistrations', action: 'not_found' });
      }

      // 2. Hard-delete from `users`
      const userSnap = await db
        .collection('users')
        .where('email', '==', email)
        .get();

      for (const docRef of userSnap.docs) {
        await docRef.ref.delete();
        results.push({ email, collection: 'users', action: 'deleted' });
      }
      if (userSnap.empty) {
        results.push({ email, collection: 'users', action: 'not_found' });
      }

      // 3. Delete from Firebase Auth (best-effort)
      try {
        const authUser = await auth.getUserByEmail(email);
        await auth.deleteUser(authUser.uid);
        results.push({ email, collection: 'auth', action: 'deleted' });
      } catch {
        results.push({ email, collection: 'auth', action: 'not_found' });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cleanup-dev-users] Error:', msg, err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
