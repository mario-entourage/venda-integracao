import { NextRequest } from 'next/server';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const SUPER_ADMIN_EMAILS = [
  'caio@entouragelab.com',
  'mario@entouragelab.com',
  'marcos.freitas@entouragelab.com',
  'tiago.fonseca@entouragelab.com',
];

function ensureAdminApp() {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'simple-login-fdcf7',
    });
  }
}

export type AdminIdentity = { email: string; uid: string };

/**
 * Verifies that the request carries a valid Firebase ID token belonging to
 * an admin user (@entouragelab.com domain + either super-admin or roles_admin doc).
 *
 * Returns an AdminIdentity on success, or a 401/403 Response on failure.
 * Callers must check: if (result instanceof Response) return result;
 */
export async function requireAdmin(request: NextRequest): Promise<AdminIdentity | Response> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json(
      { ok: false, error: 'Missing or malformed Authorization header. Expected: Bearer <firebase-id-token>' },
      { status: 401 },
    );
  }

  ensureAdminApp();

  const token = authHeader.slice(7);
  let uid: string;
  let email: string | undefined;

  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return Response.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 });
  }

  if (!email?.endsWith('@entouragelab.com')) {
    return Response.json({ ok: false, error: 'Access restricted to @entouragelab.com accounts' }, { status: 403 });
  }

  if (!SUPER_ADMIN_EMAILS.includes(email)) {
    const adminDoc = await getFirestore().collection('roles_admin').doc(uid).get();
    if (!adminDoc.exists) {
      return Response.json({ ok: false, error: 'Admin privileges required' }, { status: 403 });
    }
  }

  return { email, uid };
}
