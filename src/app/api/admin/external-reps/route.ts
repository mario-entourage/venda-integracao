import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { requireAdminSimple } from '../../_require-admin-simple';
import { validateBody } from '../../_validate';

/**
 * POST /api/admin/external-reps
 *
 * Admin-only. Creates a `users` collection document for a sales rep who has
 * NO Firebase Auth identity — they exist solely to be selectable as the rep
 * who gets credit on an order. Bypasses the @entouragelab.com email
 * constraint enforced on the regular pre-registration flow.
 *
 * The doc is created with a Firestore-generated random ID (not a Firebase
 * Auth UID — these users can never sign in). It carries:
 *   - isRepresentante: true   → picked up by getActiveRepUsersQuery and
 *                                every rep dropdown that already exists
 *   - external: true           → marks them visually + lets future logic
 *                                distinguish if needed
 *   - groupId: 'user'          → placeholder; never used for auth
 *   - active: true
 *
 * Body: { name (required), email?, state? (UF) }
 */
const BodySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  email: z
    .string()
    .trim()
    .email('email must be valid')
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'state must be a 2-letter UF code')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  // If an email was provided, reject duplicates against existing users.
  // Without this, two external reps with the same email would silently
  // coexist and the rep dropdown would show duplicates.
  if (body.email) {
    const dupe = await adminDb
      .collection('users')
      .where('email', '==', body.email)
      .limit(1)
      .get();
    if (!dupe.empty) {
      return Response.json(
        { error: 'A user with this email already exists.' },
        { status: 409 },
      );
    }
  }

  const docRef = await adminDb.collection('users').add({
    displayName: body.name,
    email: body.email ?? '',
    state: body.state ?? '',
    groupId: 'user',
    isRepresentante: true,
    external: true,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdById: auth.uid,
  });

  return Response.json({ id: docRef.id }, { status: 201 });
}
