import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { PrescriptionProduct } from '@/types';

/**
 * Saves a prescription record to the `prescriptions` Firestore collection.
 * Called after the order is created in the Nova Venda wizard (step 0 → 1).
 *
 * @returns The newly created Firestore document ID.
 */
export async function savePrescription(
  firestore: Firestore,
  data: {
    /** Date from the physical prescription (YYYY-MM-DD), or null if not found by AI. */
    prescriptionDate: string | null;
    /** Firestore Client document ID */
    clientId: string;
    /** Firestore Doctor document ID */
    doctorId: string;
    /** Firestore Order document ID — links this prescription to the order. */
    orderId: string;
    /** Firebase Storage path for the uploaded file. Empty string if no file was uploaded. */
    prescriptionPath: string;
    /** One entry per product on the prescription. */
    products: PrescriptionProduct[];
  },
): Promise<string> {
  const docRef = await addDoc(collection(firestore, 'prescriptions'), {
    prescriptionDate: data.prescriptionDate ?? null,
    /** ISO 8601 timestamp of when the wizard submitted the order. */
    uploadDate: new Date().toISOString(),
    clientId: data.clientId,
    doctorId: data.doctorId,
    orderId: data.orderId,
    prescriptionPath: data.prescriptionPath,
    products: data.products,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
