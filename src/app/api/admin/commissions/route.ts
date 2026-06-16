import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAdmin } from '../_require-admin';
import {
  calculateMarginalCommissionWithBreakdown,
  getRepTiers,
  getDefaultPayPeriod,
  type CommissionResponse,
  type RepCommissionResult,
} from '@/lib/commission';

const DEFAULT_STATUSES = ['paid', 'shipped', 'delivered'];

/**
 * GET /api/admin/commissions
 *
 * Query params:
 *   start    — ISO date string (default: current pay period start)
 *   end      — ISO date string (default: current pay period end)
 *   statuses — comma-separated order statuses (default: paid,shipped,delivered)
 *
 * Returns commission breakdown per rep for the given period.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);

    // ── Parse date range ──────────────────────────────────────────────────
    const defaultPeriod = getDefaultPayPeriod();
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? new Date(startParam) : defaultPeriod.start;
    const end = endParam ? new Date(endParam) : defaultPeriod.end;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { ok: false, error: 'Invalid date format. Use ISO date strings.' },
        { status: 400 },
      );
    }

    // ── Parse statuses ────────────────────────────────────────────────────
    const statusesParam = searchParams.get('statuses');
    const statuses = statusesParam
      ? statusesParam.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_STATUSES;

    const db = getFirestore();

    // ── 1. Get active rep users ───────────────────────────────────────────
    const repSnap = await db
      .collection('users')
      .where('isRepresentante', '==', true)
      .where('active', '==', true)
      .get();

    const repMap = new Map<string, string>(); // userId → displayName
    for (const doc of repSnap.docs) {
      const data = doc.data();
      repMap.set(doc.id, data.displayName || data.email || doc.id);
    }

    // Resolve a rep id to its surviving id. Orders created before a rep merge
    // store the now-deactivated (random) id in their representative subcollection;
    // follow the `mergedIntoUid` pointer so that credit rolls up to the rep who
    // logged in. Cached to avoid repeat reads across orders.
    const mergeResolveCache = new Map<string, string>();
    async function resolveRepId(rawId: string): Promise<string> {
      if (repMap.has(rawId)) return rawId; // active rep — no redirect
      if (mergeResolveCache.has(rawId)) return mergeResolveCache.get(rawId)!;
      let canonical = rawId;
      try {
        const uDoc = await db.collection('users').doc(rawId).get();
        const mergedInto = uDoc.exists ? (uDoc.data() as { mergedIntoUid?: string }).mergedIntoUid : undefined;
        if (mergedInto) canonical = mergedInto;
      } catch { /* ignore — fall back to raw id */ }
      mergeResolveCache.set(rawId, canonical);
      return canonical;
    }

    // ── 2. Get orders in date range ───────────────────────────────────────
    const ordersSnap = await db
      .collection('orders')
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .get();

    // ── 3. Group orders by rep ────────────────────────────────────────────
    // Structure: repUserId → { grossSales, orderCount }
    const repSales = new Map<string, { grossSales: number; orderCount: number }>();

    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data();

      // Skip soft-deleted orders
      if (order.softDeleted) continue;

      // Filter by selected statuses
      if (!statuses.includes(order.status)) continue;

      // Read representative subcollection to find rep userId
      const repSubSnap = await orderDoc.ref
        .collection('representative')
        .limit(1)
        .get();

      if (repSubSnap.empty) {
        console.warn(`[commissions] Order ${orderDoc.id} has no representative subcollection, skipping`);
        continue;
      }

      const repData = repSubSnap.docs[0].data();
      const rawRepUserId = repData.userId;

      if (!rawRepUserId) {
        console.warn(`[commissions] Order ${orderDoc.id} representative missing userId, skipping`);
        continue;
      }

      // Redirect credit to the surviving rep if this id was merged on login.
      const repUserId = await resolveRepId(rawRepUserId);

      const amount = Number(order.amount) || 0;
      const existing = repSales.get(repUserId) || { grossSales: 0, orderCount: 0 };
      existing.grossSales += amount;
      existing.orderCount += 1;
      repSales.set(repUserId, existing);
    }

    // ── 4. Calculate commission per rep ────────────────────────────────────
    const reps: RepCommissionResult[] = [];

    for (const [userId, sales] of repSales) {
      const name = repMap.get(userId) || userId;
      const tiers = getRepTiers(name);
      const breakdown = calculateMarginalCommissionWithBreakdown(sales.grossSales, tiers);
      const commission = breakdown.reduce((sum, t) => sum + t.commission, 0);

      reps.push({
        userId,
        name,
        grossSales: Math.round(sales.grossSales * 100) / 100,
        orderCount: sales.orderCount,
        commission: Math.round(commission * 100) / 100,
        tiers: breakdown,
      });
    }

    // Also include reps with zero sales so they appear in the table
    for (const [userId, name] of repMap) {
      if (!repSales.has(userId)) {
        reps.push({
          userId,
          name,
          grossSales: 0,
          orderCount: 0,
          commission: 0,
          tiers: [],
        });
      }
    }

    // Sort by gross sales descending
    reps.sort((a, b) => b.grossSales - a.grossSales);

    // ── 5. Build totals ───────────────────────────────────────────────────
    const totals = reps.reduce(
      (acc, r) => ({
        grossSales: acc.grossSales + r.grossSales,
        commission: acc.commission + r.commission,
        orderCount: acc.orderCount + r.orderCount,
      }),
      { grossSales: 0, commission: 0, orderCount: 0 },
    );

    const response: CommissionResponse = {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      statuses,
      reps,
      totals: {
        grossSales: Math.round(totals.grossSales * 100) / 100,
        commission: Math.round(totals.commission * 100) / 100,
        orderCount: totals.orderCount,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[commissions] Error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
