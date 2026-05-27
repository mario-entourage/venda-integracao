import type { NextRequest } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { requireApiKey } from '../../../_require-api-key';
import { DateRangeError, parseDateRange } from '../_date-range';

/**
 * GET /api/external/v1/doctors
 *
 * Requires API key with level >= L1.
 *
 * Query params: same as /sales-reps (date | from+to).
 *
 * Returns active doctors plus aggregate prescription stats (count of
 * prescriptions written + summed negotiatedTotalPrice across all their
 * prescription line items) over the requested range.
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

  // 1. Pull active doctors
  const doctorsSnap = await adminDb
    .collection('doctors')
    .where('active', '==', true)
    .get();

  type DocStats = {
    id: string;
    fullName: string;
    crm: string;
    specialty: string | null;
    state: string | null;
    prescriptionCount: number;
    totalPrescribedValue: number;
  };

  const doctors = new Map<string, DocStats>();
  for (const d of doctorsSnap.docs) {
    const data = d.data();
    doctors.set(d.id, {
      id: d.id,
      fullName: data.fullName ?? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
      crm: data.crm ?? '',
      specialty: data.mainSpecialty || null,
      state: data.state || null,
      prescriptionCount: 0,
      totalPrescribedValue: 0,
    });
  }

  // 2. Pull prescriptions in the date range.
  // Prescription.uploadDate is an ISO 8601 string, not a Timestamp — query
  // by string comparison (lexicographic order matches chronological for ISO).
  const fromIsoStart = `${range.fromIso}T00:00:00.000Z`;
  // Range "to" is inclusive day → use exclusive next-day boundary
  const toExclusiveDate = new Date(range.toTs.toDate());
  const toIsoExclusive = toExclusiveDate.toISOString();

  const prescriptionsSnap = await adminDb
    .collection('prescriptions')
    .where('uploadDate', '>=', fromIsoStart)
    .where('uploadDate', '<', toIsoExclusive)
    .get();

  for (const pDoc of prescriptionsSnap.docs) {
    const p = pDoc.data();
    const doctorId: string | undefined = p.doctorId;
    if (!doctorId) continue;
    const doc = doctors.get(doctorId);
    if (!doc) continue;
    doc.prescriptionCount += 1;
    if (Array.isArray(p.products)) {
      for (const line of p.products) {
        if (typeof line?.negotiatedTotalPrice === 'number') {
          doc.totalPrescribedValue += line.negotiatedTotalPrice;
        }
      }
    }
  }

  return Response.json({
    range: { from: range.fromIso, to: range.toIso },
    doctors: Array.from(doctors.values()).map((d) => ({
      id: d.id,
      fullName: d.fullName,
      crm: d.crm,
      specialty: d.specialty,
      state: d.state,
      stats: {
        prescriptionCount: d.prescriptionCount,
        totalPrescribedValue: Number(d.totalPrescribedValue.toFixed(2)),
      },
    })),
  });
}
