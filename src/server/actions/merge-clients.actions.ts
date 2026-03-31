'use server';

import { adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface MergeClientsResult {
  ordersUpdated: number;
  documentsUpdated: number;
  customerSubdocsUpdated: number;
}

/**
 * Merge `duplicateId` into `primaryId`.
 *
 * Re-points all orders and documents from the duplicate client to the primary,
 * then soft-deletes the duplicate. Safe to retry — already-migrated docs are skipped.
 */
export async function mergeClients(
  primaryId: string,
  duplicateId: string,
): Promise<MergeClientsResult> {
  if (!primaryId || !duplicateId || primaryId === duplicateId) {
    throw new Error('Primary and duplicate must be different non-empty IDs.');
  }

  let ordersUpdated = 0;
  let documentsUpdated = 0;
  let customerSubdocsUpdated = 0;

  // 1. Re-point orders.clientId
  const ordersSnap = await adminDb
    .collection('orders')
    .where('clientId', '==', duplicateId)
    .get();

  const orderBatch = adminDb.batch();
  for (const orderDoc of ordersSnap.docs) {
    orderBatch.update(orderDoc.ref, { clientId: primaryId, updatedAt: FieldValue.serverTimestamp() });
    ordersUpdated++;
  }
  if (ordersUpdated > 0) await orderBatch.commit();

  // 2. Re-point orders/*/customer.userId (the customer subcollection stores userId = clientId)
  const allOrdersSnap = await adminDb.collection('orders').get();
  const customerBatch = adminDb.batch();
  for (const orderDoc of allOrdersSnap.docs) {
    const custSnap = await orderDoc.ref
      .collection('customer')
      .where('userId', '==', duplicateId)
      .get();
    for (const custDoc of custSnap.docs) {
      customerBatch.update(custDoc.ref, { userId: primaryId, updatedAt: FieldValue.serverTimestamp() });
      customerSubdocsUpdated++;
    }
  }
  if (customerSubdocsUpdated > 0) await customerBatch.commit();

  // 3. Re-point documents.clientId
  const docsSnap = await adminDb
    .collection('documents')
    .where('clientId', '==', duplicateId)
    .get();

  const docBatch = adminDb.batch();
  for (const docRef of docsSnap.docs) {
    docBatch.update(docRef.ref, { clientId: primaryId, updatedAt: FieldValue.serverTimestamp() });
    documentsUpdated++;
  }
  if (documentsUpdated > 0) await docBatch.commit();

  // 4. Soft-delete the duplicate client
  await adminDb.collection('clients').doc(duplicateId).update({
    active: false,
    removedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    mergedInto: primaryId,
  });

  console.log(
    `[mergeClients] ${duplicateId} → ${primaryId}:`,
    `orders=${ordersUpdated} docs=${documentsUpdated} customerSubdocs=${customerSubdocsUpdated}`,
  );

  return { ordersUpdated, documentsUpdated, customerSubdocsUpdated };
}
