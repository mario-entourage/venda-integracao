import type { NextRequest } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { requireApiKey } from '../../../_require-api-key';

/**
 * GET /api/external/v1/clients
 *
 * Requires API key with level >= L2.
 *
 * Returns patient identity / contact info — NO health or prescription data.
 * That stays gated behind L3.
 *
 * Query params:
 *   - limit       (1-500, default 100)
 *   - cursor      (id of last client from previous page; use `nextCursor`)
 *   - activeOnly  ("true" by default — set "false" to include soft-deleted)
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request, 'L2');
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 500)
    : 100;
  const cursor = url.searchParams.get('cursor');
  const activeOnly = (url.searchParams.get('activeOnly') ?? 'true') !== 'false';

  let q = adminDb
    .collection('clients')
    .orderBy('createdAt', 'asc')
    .limit(limit);

  if (activeOnly) q = q.where('active', '==', true);

  if (cursor) {
    const cursorDoc = await adminDb.collection('clients').doc(cursor).get();
    if (cursorDoc.exists) q = q.startAfter(cursorDoc);
  }

  const snap = await q.get();

  const clients = snap.docs.map((d) => {
    const c = d.data();
    return {
      id: d.id,
      document: c.document ?? null, // CPF / CNPJ
      rg: c.rg ?? null,
      fullName: c.fullName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      email: c.email ?? null,
      phone: c.phone ?? null,
      birthDate:
        c.birthDate instanceof Timestamp
          ? c.birthDate.toDate().toISOString().slice(0, 10)
          : null,
      address: c.address
        ? {
            postalCode: c.address.postalCode ?? null,
            street: c.address.street ?? null,
            number: c.address.number ?? null,
            complement: c.address.complement ?? null,
            neighborhood: c.address.neighborhood ?? null,
            city: c.address.city ?? null,
            state: c.address.state ?? null,
            country: c.address.country ?? null,
          }
        : null,
      active: c.active === true,
    };
  });

  const nextCursor =
    snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

  return Response.json({ clients, nextCursor });
}
