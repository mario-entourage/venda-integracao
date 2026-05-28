import type { NextRequest } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { requireApiKey } from '../../../_require-api-key';
import { DateRangeError, parseDateRange } from '../_date-range';

/**
 * GET /api/external/v1/orders
 *
 * Requires API key with level >= L3 (because product detail is considered
 * health data — pharmaceutical items including controlled substances).
 *
 * Query params:
 *   - date | from+to     (createdAt window; defaults to today UTC)
 *   - includeProducts    ("true" by default — set "false" to omit product lines)
 *
 * Returns orders in the date range plus their product line items.
 * Does NOT include payment instrument detail, ZapSign signing URLs, or
 * other operational fields not relevant to external consumers.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request, 'L3');
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  let range;
  try {
    range = parseDateRange(url);
  } catch (err) {
    if (err instanceof DateRangeError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const includeProducts = (url.searchParams.get('includeProducts') ?? 'true') !== 'false';

  const ordersSnap = await adminDb
    .collection('orders')
    .where('createdAt', '>=', range.fromTs)
    .where('createdAt', '<', range.toTs)
    .get();

  const CONCURRENCY = 16;
  const docs = ordersSnap.docs.filter((d) => !d.data().softDeleted);

  const results: unknown[] = [];

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const batch = docs.slice(i, i + CONCURRENCY);
    const built = await Promise.all(
      batch.map(async (orderDoc) => {
        const o = orderDoc.data();
        const base = {
          id: orderDoc.id,
          status: o.status ?? null,
          invoice: o.invoice ?? null,
          type: o.type ?? null,
          currency: o.currency ?? null,
          amount: typeof o.amount === 'number' ? o.amount : null,
          discount: typeof o.discount === 'number' ? o.discount : null,
          frete: typeof o.frete === 'number' ? o.frete : null,
          exchangeRate: o.exchangeRate ?? null,
          exchangeRateDate: o.exchangeRateDate ?? null,
          clientId: o.clientId ?? null,
          prescriptionDocId: o.prescriptionDocId ?? null,
          anvisaRequestId: o.anvisaRequestId ?? null,
          anvisaStatus: o.anvisaStatus ?? null,
          codigoRastreio: o.codigoRastreio ?? null,
          statusEnvio: o.statusEnvio ?? null,
          dataEnvio: o.dataEnvio ?? null,
          createdAt:
            o.createdAt && typeof o.createdAt.toDate === 'function'
              ? o.createdAt.toDate().toISOString()
              : null,
          updatedAt:
            o.updatedAt && typeof o.updatedAt.toDate === 'function'
              ? o.updatedAt.toDate().toISOString()
              : null,
        };

        if (!includeProducts) return base;

        const productsSnap = await adminDb
          .collection('orders')
          .doc(orderDoc.id)
          .collection('products')
          .get();

        const products = productsSnap.docs.map((p) => {
          const pd = p.data();
          return {
            id: p.id,
            stockProductId: pd.stockProductId ?? null,
            productName: pd.productName ?? null,
            quantity: typeof pd.quantity === 'number' ? pd.quantity : null,
            price: typeof pd.price === 'number' ? pd.price : null,
            discount: typeof pd.discount === 'number' ? pd.discount : null,
          };
        });

        return { ...base, products };
      }),
    );
    results.push(...built);
  }

  return Response.json({
    range: { from: range.fromIso, to: range.toIso },
    orders: results,
  });
}
