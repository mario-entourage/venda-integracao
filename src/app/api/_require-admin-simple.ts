import type { NextRequest } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { requireAuth, type AuthIdentity } from './_require-auth';

const SUPER_ADMIN_EMAILS = [
  'caio@entouragelab.com',
  'mario@entouragelab.com',
  'marcos.freitas@entouragelab.com',
  'tiago.fonseca@entouragelab.com',
];

/**
 * Verifies the request carries a valid Firebase ID token from an admin user.
 * Builds on requireAuth and additionally checks the roles_admin collection
 * (or the SUPER_ADMIN_EMAILS list) using the shared adminDb singleton.
 *
 * Returns an AuthIdentity on success, or a 401/403 Response on failure.
 * Callers must check: if (result instanceof Response) return result;
 */
export async function requireAdminSimple(
  request: NextRequest,
): Promise<AuthIdentity | Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  if (!auth.email.endsWith('@entouragelab.com')) {
    return Response.json(
      { ok: false, error: 'Access restricted to @entouragelab.com accounts' },
      { status: 403 },
    );
  }

  if (!SUPER_ADMIN_EMAILS.includes(auth.email)) {
    const adminDoc = await adminDb.collection('roles_admin').doc(auth.uid).get();
    if (!adminDoc.exists) {
      return Response.json(
        { ok: false, error: 'Admin privileges required' },
        { status: 403 },
      );
    }
  }

  return auth;
}
