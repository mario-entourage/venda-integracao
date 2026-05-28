import type { NextRequest } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { requireApiKey } from '../../../_require-api-key';
import { DateRangeError, parseDateRange } from '../_date-range';

/**
 * GET /api/external/v1/sales-reps
 *
 * Requires API key with level >= L1.
 *
 * Query params:
 *   - date=YYYY-MM-DD                   (single day; defaults to today UTC)
 *   - from=YYYY-MM-DD&to=YYYY-MM-DD     (inclusive range, max 92 days)
 *
 * Returns active sales representatives plus aggregate sales stats
 * (order count + summed order amount) over the requested range.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request, 'L1');
  if (auth instanceof Response) return auth;

  let range;
  try {
    range = parseDateRange(new URL(request.url));
  } catch (err) {
    if (err instanceof DateRangeError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // 1. Pull active sales reps
  const repsSnap = await adminDb
    .collection('representantes')
    .where('active', '==', true)
    .get();

  type RepStats = {
    id: string;
    name: string;
    email: string | null;
    state: string | null;
    userId: string | null;
    saleCount: number;
    totalAmount: number;
    currency: string | null;
  };

  const reps = new Map<string, RepStats>();
  // Also index by userId so we can attribute order-representative subdocs.
  const repByUserId = new Map<string, RepStats>();

  for (const d of repsSnap.docs) {
    const data = d.data();
    const rep: RepStats = {
      id: d.id,
      name: data.name ?? '',
      email: data.email || null,
      state: data.estado || null,
      userId: data.userId || null,
      saleCount: 0,
      totalAmount: 0,
      currency: null,
    };
    reps.set(d.id, rep);
    if (rep.userId) repByUserId.set(rep.userId, rep);
  }

  // 2. Pull orders in the date range
  const ordersSnap = await adminDb
    .collection('orders')
    .where('createdAt', '>=', range.fromTs)
    .where('createdAt', '<', range.toTs)
    .get();

  // 3. For each order, fetch its representative subdoc and aggregate.
  // We do this with limited concurrency to avoid hammering Firestore.
  const orderDocs = ordersSnap.docs;
  const CONCURRENCY = 16;
  for (let i = 0; i < orderDocs.length; i += CONCURRENCY) {
    const batch = orderDocs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (orderDoc) => {
        const order = orderDoc.data();
        if (order.softDeleted) return;
        const repSnap = await adminDb
          .collection('orders')
          .doc(orderDoc.id)
          .collection('representative')
          .limit(1)
          .get();
        if (repSnap.empty) return;
        const repDoc = repSnap.docs[0].data();
        const userId: string | undefined = repDoc.userId;
        const rep = userId ? repByUserId.get(userId) : undefined;
        if (!rep) return;
        rep.saleCount += 1;
        rep.totalAmount += typeof order.amount === 'number' ? order.amount : 0;
        if (!rep.currency && typeof order.currency === 'string') {
          rep.currency = order.currency;
        }
      }),
    );
  }

  return Response.json({
    range: { from: range.fromIso, to: range.toIso },
    salesReps: Array.from(reps.values()).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      state: r.state,
      stats: {
        saleCount: r.saleCount,
        totalAmount: Number(r.totalAmount.toFixed(2)),
        currency: r.currency,
      },
    })),
  });
}
