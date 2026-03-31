import type { NextRequest } from 'next/server';
import { adminAuth } from '@/firebase/admin';

export type AuthIdentity = { uid: string; email: string };

/**
 * Verifies that the request carries a valid Firebase ID token from any
 * authenticated user. Less restrictive than requireAdmin — any user
 * who has signed in may call routes guarded by this helper.
 *
 * Returns an AuthIdentity on success, or a 401 Response on failure.
 * Callers must check: if (result instanceof Response) return result;
 */
export async function requireAuth(request: NextRequest): Promise<AuthIdentity | Response> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json(
      {
        ok: false,
        error: 'Authentication required. Expected: Authorization: Bearer <firebase-id-token>',
      },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? '' };
  } catch {
    return Response.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 });
  }
}
