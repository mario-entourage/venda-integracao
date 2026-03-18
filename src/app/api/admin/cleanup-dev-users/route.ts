import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';

export const dynamic = 'force-dynamic';

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}

const DEV_EMAILS = ['dev-admin@entouragelab.com'];

export async function POST() {
  try {
    const db = getFirestore();
    const results: { email: string; action: string }[] = [];

    for (const email of DEV_EMAILS) {
      const snap = await db
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (snap.empty) {
        results.push({ email, action: 'not_found' });
        continue;
      }

      const userDoc = snap.docs[0];
      await userDoc.ref.update({
        active: false,
        removedAt: new Date(),
        updatedAt: new Date(),
      });

      results.push({ email, action: 'soft_deleted' });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cleanup-dev-users] Error:', msg, err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
