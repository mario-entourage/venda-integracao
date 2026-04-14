import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { requireAdmin } from '../_require-admin';

export const dynamic = 'force-dynamic';

function getApp() {
  if (getApps().length === 0) {
    return initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'simple-login-fdcf7',
    });
  }
  return getApps()[0];
}

/**
 * POST /api/admin/activate-all-users
 *
 * 1. Converts pending pre-registrations into real user docs
 *    (finds or creates their Firebase Auth account to get a UID)
 * 2. Sets all users with active !== true to active: true
 * 3. Creates roles_admin docs for users with groupId === 'admin'
 *
 * Safe to run multiple times (idempotent).
 */
async function run() {
  try {
    const app = getApp();
    const db = getFirestore(app);
    const auth = getAuth(app);

    // ── 1. Convert pre-registrations to real users ──────────────────────
    const preregSnap = await db.collection('preregistrations').get();
    const converted: string[] = [];
    const conversionErrors: Array<{ email: string; error: string }> = [];

    // Collect existing user emails to avoid duplicates
    const existingUsersSnap = await db.collection('users').get();
    const existingEmails = new Set(
      existingUsersSnap.docs.map((d) => d.data().email as string),
    );

    for (const preregDoc of preregSnap.docs) {
      const prereg = preregDoc.data();
      const email = prereg.email as string;

      // Skip if a user doc with this email already exists
      if (existingEmails.has(email)) {
        // Clean up the stale pre-registration
        await preregDoc.ref.delete();
        converted.push(`${email} (already existed, cleaned up prereg)`);
        continue;
      }

      try {
        // Find or create their Firebase Auth account
        let uid: string;
        try {
          const authUser = await auth.getUserByEmail(email);
          uid = authUser.uid;
        } catch {
          // Auth user doesn't exist — create one (they'll use Google sign-in)
          const newAuthUser = await auth.createUser({
            email,
            emailVerified: true,
          });
          uid = newAuthUser.uid;
        }

        const groupId = (prereg.groupId as string) || 'user';
        const isRep = prereg.isRepresentante === true;

        // Create the user doc
        const batch = db.batch();

        batch.set(db.collection('users').doc(uid), {
          email,
          groupId,
          displayName: '',
          isRepresentante: isRep,
          active: true,
          lastLogin: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create roles_admin doc if they're an admin
        if (groupId === 'admin') {
          batch.set(db.collection('roles_admin').doc(uid), {
            grantedAt: new Date().toISOString(),
          });
        }

        // Delete the pre-registration
        batch.delete(preregDoc.ref);

        await batch.commit();
        converted.push(email);
        existingEmails.add(email);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        conversionErrors.push({ email, error: msg });
      }
    }

    // ── 2. Activate inactive users ──────────────────────────────────────
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

    // ── 3. Diagnostic: final state ──────────────────────────────────────
    const finalUsersSnap = await db.collection('users').get();
    const finalPreregSnap = await db.collection('preregistrations').get();

    const usersList = finalUsersSnap.docs.map((d) => ({
      id: d.id,
      email: d.data().email,
      active: d.data().active,
      groupId: d.data().groupId,
    }));

    return NextResponse.json({
      ok: true,
      converted,
      conversionErrors: conversionErrors.length > 0 ? conversionErrors : undefined,
      activated: activatedCount,
      totalUsers: finalUsersSnap.size,
      remainingPreregistrations: finalPreregSnap.size,
      users: usersList,
      message: `Converted ${converted.length} pre-registrations, activated ${activatedCount} users. ${finalUsersSnap.size} total users now.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[activate-all-users] Error:', msg, err);
    return NextResponse.json(
      { ok: false, error: 'Failed', details: msg },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const auth_result = await requireAdmin(request);
  if (auth_result instanceof Response) return auth_result;
  console.log(`[activate-all-users] Triggered by ${auth_result.email}`);
  return run();
}

export async function POST(request: NextRequest) {
  const auth_result = await requireAdmin(request);
  if (auth_result instanceof Response) return auth_result;
  console.log(`[activate-all-users] Triggered by ${auth_result.email}`);
  return run();
}
