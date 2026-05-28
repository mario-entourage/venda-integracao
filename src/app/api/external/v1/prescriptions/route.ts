import type { NextRequest } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { requireApiKey } from '../../../_require-api-key';
import { DateRangeError, parseDateRange } from '../_date-range';

/**
 * GET /api/external/v1/prescriptions
 *
 * Requires API key with level >= L3 (health data).
 *
 * Query params: date | from+to (defaults to today UTC).
 *
 * Returns prescription records (including doctor + client FKs and product
 * line items) for the date range. Does NOT include the prescription file
 * itself — the `prescriptionPath` reference is provided so trusted
 * downstream systems can fetch separately if needed.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request, 'L3');
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

  const fromIsoStart = `${range.fromIso}T00:00:00.000Z`;
  const toIsoExclusive = new Date(range.toTs.toDate()).toISOString();

  const snap = await adminDb
    .collection('prescriptions')
    .where('uploadDate', '>=', fromIsoStart)
    .where('uploadDate', '<', toIsoExclusive)
    .get();

  const prescriptions = snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      prescriptionDate: p.prescriptionDate ?? null,
      uploadDate: p.uploadDate ?? null,
      clientId: p.clientId ?? null,
      doctorId: p.doctorId ?? null,
      orderId: p.orderId ?? null,
      prescriptionPath: p.prescriptionPath || null,
      products: Array.isArray(p.products)
        ? p.products.map((line: Record<string, unknown>) => ({
            productId: line.productId ?? null,
            productName: line.productName ?? null,
            quantity: typeof line.quantity === 'number' ? line.quantity : null,
            negotiatedTotalPrice:
              typeof line.negotiatedTotalPrice === 'number'
                ? line.negotiatedTotalPrice
                : null,
          }))
        : [],
    };
  });

  return Response.json({
    range: { from: range.fromIso, to: range.toIso },
    prescriptions,
  });
}
