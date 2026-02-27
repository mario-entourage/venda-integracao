/**
 * Represents one product line within a saved prescription record.
 */
export interface PrescriptionProduct {
  /** Firestore product document ID */
  productId: string;
  productName: string;
  quantity: number;
  /** negotiatedPrice * quantity — the negotiated total for this line */
  negotiatedTotalPrice: number;
}

/**
 * A prescription document stored in the `prescriptions` Firestore collection.
 * One record is created per "Nova Venda" wizard submission, linking the
 * uploaded medical prescription image/PDF to the resulting order.
 */
export interface Prescription {
  /** Auto-generated Firestore document ID (populated after read). */
  id?: string;

  /** Date printed on the prescription, formatted as YYYY-MM-DD.
   *  Extracted by the Gemini AI vision model; null when not found. */
  prescriptionDate: string | null;

  /** ISO 8601 timestamp of when the file was uploaded / the wizard was submitted. */
  uploadDate: string;

  /** Firestore Client document ID */
  clientId: string;

  /** Firestore Doctor document ID */
  doctorId: string;

  /** Firestore Order document ID — links this prescription to the generated order. */
  orderId: string;

  /** Firebase Storage path for the uploaded prescription file.
   *  Empty string if the user did not upload a file. */
  prescriptionPath: string;

  /** One entry per product on the prescription. */
  products: PrescriptionProduct[];

  /** Firestore server timestamp — set by serverTimestamp() on write. */
  createdAt: Date;
}
