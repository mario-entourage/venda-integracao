import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAdmin } from '../_require-admin';

export const dynamic = 'force-dynamic';

function getDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'simple-login-fdcf7',
    });
  }
  return getFirestore();
}

/**
 * POST /api/admin/backfill-anvisa-profiles
 *
 * One-time migration: reads Caio's ANVISA solicitante profile and writes it
 * to every user's anvisa_userProfiles document. Also sets the
 * anvisa_defaultProfile/current pointer to Caio so new users inherit his data.
 *
 * Safe to run multiple times (idempotent).
 */
async function run() {
  try {
    const db = getDb();

    // 1. Find Caio's user doc by email
    const usersSnap = await db
      .collection('users')
      .where('email', '==', 'caio@entouragelab.com')
      .limit(1)
      .get();

    if (usersSnap.empty) {
      return NextResponse.json(
        { ok: false, error: 'Caio user not found (caio@entouragelab.com)' },
        { status: 404 },
      );
    }

    const caioUid = usersSnap.docs[0].id;

    // 2. Read Caio's ANVISA profile
    const caioProfileSnap = await db
      .collection('anvisa_userProfiles')
      .doc(caioUid)
      .get();

    if (!caioProfileSnap.exists) {
      return NextResponse.json(
        { ok: false, error: `Caio's ANVISA profile not found (uid: ${caioUid}). Please save his profile at /anvisa/perfil first.` },
        { status: 404 },
      );
    }

    const caioProfile = caioProfileSnap.data()!;

    // 3. List all users
    const allUsersSnap = await db.collection('users').get();

    // 4. Batch-write Caio's profile to every user's anvisa_userProfiles doc
    let updated = 0;
    let skippedCaio = false;
    const BATCH_LIMIT = 450;
    let batch = db.batch();
    let batchCount = 0;

    for (const userDoc of allUsersSnap.docs) {
      const uid = userDoc.id;

      if (uid === caioUid) {
        skippedCaio = true;
        continue;
      }

      const profileRef = db.collection('anvisa_userProfiles').doc(uid);
      batch.set(profileRef, { ...caioProfile }, { merge: false });
      batchCount++;
      updated++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // 5. Set default profile pointer to Caio
    const defaultRef = db.collection('anvisa_defaultProfile').doc('current');
    batch.set(defaultRef, { userId: caioUid }, { merge: true });
    batchCount++;

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(
      `[backfill-anvisa-profiles] Done: ${updated} profiles updated, caio=${caioUid}, skippedCaio=${skippedCaio}`,
    );

    return NextResponse.json({
      ok: true,
      caioUid,
      totalUsers: allUsersSnap.size,
      updated,
      message: `${updated} user profiles updated with Caio's ANVISA data. Default profile set.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[backfill-anvisa-profiles] Error:', msg, err);
    return NextResponse.json(
      { ok: false, error: 'Backfill failed', details: msg },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const auth_result = await requireAdmin(request);
  if (auth_result instanceof Response) return auth_result;
  console.log(`[backfill-anvisa-profiles] Triggered by ${auth_result.email}`);
  return run();
}

export async function POST(request: NextRequest) {
  const auth_result = await requireAdmin(request);
  if (auth_result instanceof Response) return auth_result;
  console.log(`[backfill-anvisa-profiles] Triggered by ${auth_result.email}`);
  return run();
}
