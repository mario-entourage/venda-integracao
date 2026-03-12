import { NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/backfill-anvisa-profiles
 *
 * One-time migration: reads Caio's ANVISA solicitante profile and writes it
 * to every user's anvisa_userProfiles document. Also sets the
 * anvisa_defaultProfile/current pointer to Caio so new users inherit his data.
 *
 * Steps:
 * 1. Find Caio by email (caio@entouragelab.com) in the users collection
 * 2. Read his anvisa_userProfiles doc
 * 3. List all users
 * 4. For each user, write Caio's profile data into their anvisa_userProfiles doc
 *    (merge: false — full overwrite to ensure clean state)
 * 5. Set anvisa_defaultProfile/current to point at Caio's userId
 *
 * Safe to run multiple times (idempotent).
 */
export async function POST() {
  try {
    const db = adminDb;

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
    const BATCH_LIMIT = 450; // Firestore batch limit is 500, leave margin
    let batch = db.batch();
    let batchCount = 0;

    for (const userDoc of allUsersSnap.docs) {
      const uid = userDoc.id;

      // Skip Caio himself — his profile is the source
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
    console.error('[backfill-anvisa-profiles] Error:', err);
    return NextResponse.json(
      { ok: false, error: 'Backfill failed', details: String(err) },
      { status: 500 },
    );
  }
}

// GET alias so you can trigger from browser
export async function GET() {
  return POST();
}
