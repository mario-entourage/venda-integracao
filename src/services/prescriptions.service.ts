import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { PrescriptionProduct } from '@/types';

/**
 * Saves a prescription record to the `prescriptions` Firestore collection.
 * Called after the order is created in the Nova Venda wizard (step 0 → 1).
 *
 * The prescription document ID is set to the **orderId** so that both the
 * order and its prescription share the same primary key (the "Receita ID").
 *
 * @returns The document ID (same as orderId).
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
    /** Firestore Order document ID — used as the prescription document ID. */
    orderId: string;
    /** Firebase Storage path for the uploaded file. Empty string if no file was uploaded. */
    prescriptionPath: string;
    /** One entry per product on the prescription. */
    products: PrescriptionProduct[];
  },
): Promise<string> {
  const prescriptionRef = doc(firestore, 'prescriptions', data.orderId);
  await setDoc(prescriptionRef, {
    prescriptionDate: data.prescriptionDate ?? null,
    uploadDate: new Date().toISOString(),
    clientId: data.clientId,
    doctorId: data.doctorId,
    orderId: data.orderId,
    prescriptionPath: data.prescriptionPath,
    products: data.products,
    createdAt: serverTimestamp(),
  });

  return data.orderId;
}
