import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { requireAdminSimple } from '../../_require-admin-simple';
import { validateBody } from '../../_validate';

/**
 * POST /api/admin/activate-rep
 *
 * Admin-only. Makes a pre-registered (but never-logged-in) internal user
 * selectable as a sales rep *immediately*, without waiting for their first
 * login. Creates an active `users` doc (random ID) carrying the rep flag and
 * the group/display name from their pre-registration.
 *
 * Unlike /external-reps, this does NOT set `external: true` — these are real
 * @entouragelab.com people who can sign in later. When they do, `ensureUser`
 * folds this doc into their UID-keyed account by matching email (see
 * FR-05.10), so no duplicate rep is created. The pre-registration is kept so
 * the correct groupId is applied and consumed on that first login.
 *
 * Idempotent: if a user doc already exists for the email, it is updated to
 * isRepresentante: true / active: true instead of creating a second one.
 *
 * Body: { email (required) }
 */
const BodySchema = z.object({
  email: z.string().trim().email('email must be valid').max(200),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  const email = body.email;

  // If a user doc already exists for this email, just flag it as a rep.
  const existing = await adminDb
    .collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();
  if (!existing.empty) {
    const ref = existing.docs[0].ref;
    await ref.update({
      isRepresentante: true,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ id: ref.id, updated: true }, { status: 200 });
  }

  // Otherwise pull group/display name from the pending pre-registration.
  const preregId = email.replace(/[.@]/g, '_');
  const preregSnap = await adminDb.collection('preregistrations').doc(preregId).get();
  const prereg = preregSnap.exists ? (preregSnap.data() as Record<string, unknown>) : null;

  const docRef = await adminDb.collection('users').add({
    displayName: (prereg?.displayName as string) || '',
    email,
    groupId: (prereg?.groupId as string) || 'user',
    isRepresentante: true,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdById: auth.uid,
  });

  return Response.json({ id: docRef.id }, { status: 201 });
}
