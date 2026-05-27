import type { NextRequest } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { requireApiKey } from '../../../_require-api-key';

/**
 * GET /api/external/v1/anvisa-authorizations
 *
 * Requires API key with level >= L3 (health data).
 *
 * Query params:
 *   - status      (optional — filter by AnvisaRequestStatus, e.g. CONCLUIDO)
 *   - limit       (1-500, default 100)
 *   - cursor      (id of last record from previous page; use `nextCursor`)
 *
 * Returns metadata on ANVISA import authorization requests. Excludes raw
 * OCR text and document file paths — only ID-level references are exposed.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request, 'L3');
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limitParam = Number(url.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 500)
    : 100;
  const cursor = url.searchParams.get('cursor');

  let q = adminDb
    .collection('anvisa_requests')
    .where('softDeleted', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (status) q = q.where('status', '==', status);

  if (cursor) {
    const cursorDoc = await adminDb.collection('anvisa_requests').doc(cursor).get();
    if (cursorDoc.exists) q = q.startAfter(cursorDoc);
  }

  const snap = await q.get();

  const authorizations = snap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id,
      patientDisplayName: r.patientDisplayName ?? null,
      status: r.status ?? null,
      confirmationNumber: r.confirmationNumber ?? null,
      orderId: r.orderId ?? null,
      ownerEmail: r.ownerEmail ?? null,
      createdAt: r.createdAt ?? null,
      updatedAt: r.updatedAt ?? null,
    };
  });

  const nextCursor =
    snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

  return Response.json({ authorizations, nextCursor });
}
