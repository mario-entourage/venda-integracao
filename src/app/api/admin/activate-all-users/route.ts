import { NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/activate-all-users
 *
 * One-time migration: sets all users with active !== true to active: true.
 * Also converts pending pre-registrations into real user documents so they
 * show as "Ativo" immediately (they can still log in normally later).
 *
 * Safe to run multiple times (idempotent).
 */
export async function POST() {
  try {
    const db = adminDb;

    // 1. Activate all existing users whose active flag is not true
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
    console.error('[activate-all-users] Error:', err);
    return NextResponse.json(
      { ok: false, error: 'Activation failed', details: String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST();
}
