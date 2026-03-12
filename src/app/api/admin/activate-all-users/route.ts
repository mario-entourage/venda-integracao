import { NextResponse } from 'next/server';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
 * POST /api/admin/activate-all-users
 *
 * One-time migration: sets all users with active !== true to active: true.
 * Safe to run multiple times (idempotent).
 */
async function run() {
  try {
    const db = getDb();

    const usersSnap = await db.collection('users').get();
    let activatedCount = 0;
    const BATCH_LIMIT = 450;
    let batch = db.batch();
    let batchCount = 0;

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      if (data.active !== true) {
        batch.update(userDoc.ref, { active: true });
        batchCount++;
        activatedCount++;

        if (batchCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(
      `[activate-all-users] Done: ${activatedCount} users activated out of ${usersSnap.size} total`,
    );

    return NextResponse.json({
      ok: true,
      totalUsers: usersSnap.size,
      activated: activatedCount,
      message: `${activatedCount} users set to active.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[activate-all-users] Error:', msg, err);
    return NextResponse.json(
      { ok: false, error: 'Activation failed', details: msg },
      { status: 500 },
    );
  }
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}
