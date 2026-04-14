import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin';
import { requireAdminSimple } from '../../_require-admin-simple';
import { validateBody } from '../../_validate';

/**
 * POST /api/payments/delete-link
 *
 * Admin-only. Permanently deletes a payment link from Firestore.
 * Guards: refuses to delete links with status 'paid' to prevent data loss.
 *
 * Body: { linkId, orderId }
 *   linkId  — Firestore document ID of the payment link
 *   orderId — The associated order ID, or "" for standalone (top-level) links
 *
 * Returns: { ok }
 */

const BodySchema = z.object({
  linkId: z.string().min(1),
  orderId: z.string(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  const { linkId, orderId } = body;

  try {
    const db = adminDb;
    const linkRef = orderId
      ? db.collection('orders').doc(orderId).collection('paymentLinks').doc(linkId)
      : db.collection('paymentLinks').doc(linkId);

    const linkSnap = await linkRef.get();
    if (!linkSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Link not found' }, { status: 404 });
    }

    const { status } = linkSnap.data()!;
    if (status === 'paid') {
      return NextResponse.json(
        { ok: false, error: 'Cannot delete a paid link — payment records must be preserved' },
        { status: 400 },
      );
    }

    await linkRef.delete();

    console.log(
      `[payments/delete-link] Deleted linkId=${linkId} orderId="${orderId}" status="${status}" by ${auth.email}`,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[payments/delete-link] Error:', err);
    return NextResponse.json(
      { ok: false, error: 'Delete failed', details: String(err) },
      { status: 500 },
    );
  }
}
