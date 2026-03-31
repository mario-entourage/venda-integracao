import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';

/**
 * POST /api/admin/backfill-client-ids
 *
 * One-time migration: for each document in the `documents` collection that
 * has no clientId, look up the associated order via orderId and copy the
 * order's clientId (stored as customer.userId in the customer subcollection)
 * onto the document record.
 *
 * Safe to run multiple times — documents that already have a clientId are skipped.
 *
 * Returns: { checked, updated, skipped_no_order, skipped_no_client, errors }
 */
export async function POST(_request: NextRequest) {
  let checked = 0;
  let updated = 0;
  let skipped_no_order = 0;
  let skipped_no_client = 0;
  let errors = 0;

  try {
    // Fetch all documents without a clientId (Firestore doesn't support "field does not exist"
    // queries directly, so we fetch all and filter — acceptable for a one-time migration)
    const snap = await adminDb.collection('documents').get();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();

      // Skip if already has clientId
      if (data.clientId) continue;

      checked++;
      const orderId = String(data.orderId || '');

      if (!orderId) {
        skipped_no_order++;
        continue;
      }

      try {
        // Look up clientId from the order's customer subcollection (userId field = client FK)
        const customerSnap = await adminDb
          .collection('orders')
          .doc(orderId)
          .collection('customer')
          .limit(1)
          .get();

        if (customerSnap.empty) {
          skipped_no_order++;
          continue;
        }

        const clientId = String(customerSnap.docs[0].data().userId || '');

        if (!clientId) {
          skipped_no_client++;
          continue;
        }

        // Also try to update the order itself if it's missing clientId
        const orderSnap = await adminDb.collection('orders').doc(orderId).get();
        if (orderSnap.exists && !orderSnap.data()?.clientId) {
          await adminDb.collection('orders').doc(orderId).update({ clientId });
        }

        await docSnap.ref.update({ clientId });
        updated++;
      } catch (err) {
        errors++;
        console.error(`[backfill-client-ids] Error on doc ${docSnap.id}:`, err);
      }
    }

    console.log(
      `[backfill-client-ids] checked=${checked} updated=${updated}`,
      `skipped_no_order=${skipped_no_order} skipped_no_client=${skipped_no_client}`,
      `errors=${errors}`,
    );

    return NextResponse.json({ ok: true, checked, updated, skipped_no_order, skipped_no_client, errors });
  } catch (err) {
    console.error('[backfill-client-ids] Fatal error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
