/**
 * ANVISA module types.
 *
 * Adapted from the standalone Anvisa_app. The ANVISA `UserProfile` is renamed
 * to `AnvisaUserProfile` to avoid conflicts with VENDA's own `UserProfile`.
 * The ANVISA `User` type is dropped — we reuse VENDA's `User` instead.
 */

// ─── Request status workflow ────────────────────────────────────────────────

export type AnvisaRequestStatus =
  | 'PENDENTE'
  | 'EM_AJUSTE'
  | 'EM_AUTOMACAO'
  | 'CONCLUIDO'
  | 'ERRO';

// ─── Patient request (top-level document in anvisa_requests) ────────────────

export type PatientRequest = {
  id: string;
  patientDisplayName: string;
  status: AnvisaRequestStatus;
  createdAt: string;
  updatedAt: string;
  ownerEmail: string;
  pacienteDocumentId: string;
  pacienteDocumentIds?: string[];
  procuracaoDocumentId: string;
  procuracaoDocumentIds?: string[];
  comprovanteResidenciaDocumentId: string;
  comprovanteResidenciaDocumentIds?: string[];
  receitaMedicaDocumentId: string;
  receitaMedicaDocumentIds?: string[];
  currentStep: string;
  softDeleted: boolean;
  confirmationNumber: string | null;
  /** FK → orders. The originating sales order (empty for standalone requests). */
  orderId?: string;
  /** Firebase Storage path to the prescription imported from the linked order. */
  prescriptionSourcePath?: string;
};

// ─── ANVISA document types ──────────────────────────────────────────────────

export type AnvisaDocumentType =
  | 'DOCUMENTO_PACIENTE'
  | 'COMPROVANTE_RESIDENCIA'
  | 'PROCURACAO'
  | 'RECEITA_MEDICA';

export type UploadedFile = {
  name: string;
  size: number;
  type: AnvisaDocumentType;
};

// ─── Document base (subcollection docs) ─────────────────────────────────────

export type DocumentBase = {
  id: string;
  fileName: string;
  fileStoragePath: string;
  ocrTextChunks: string[];
  ocrStatus?: 'pending' | 'completed' | 'error';
  extractedFields: string; // JSON string
  missingCriticalFields: string[];
  fieldConfidence: string; // JSON string
};

export type PacienteDocument = DocumentBase;
export type ComprovanteResidenciaDocument = DocumentBase;
export type ProcuracaoDocument = DocumentBase;
export type ReceitaMedicaDocument = DocumentBase;

// ─── OCR extracted data ─────────────────────────────────────────────────────

export type OcrData = {
  patientName?: string;
  patientRg?: string;
  patientCpf?: string;
  patientDob?: string;
  patientCep?: string;
  patientAddress?: string;
  patientState?: string;
  patientCity?: string;
  patientPhone?: string;
  patientEmail?: string;
  doctorName?: string;
  doctorCrm?: string;
  doctorSpecialty?: string;
  doctorUf?: string;
  doctorCity?: string;
  doctorPhone?: string;
  doctorMobile?: string;
  doctorEmail?: string;
  prescriptionDate?: string;
  prescriptionMedication?: string;
  prescriptionDosage?: string;
};

export type ConfidenceScores = {
  [K in keyof OcrData]?: number;
};

// ─── ANVISA requester profile ───────────────────────────────────────────────

export type AnvisaUserProfile = {
  requesterName: string;
  requesterEmail: string;
  requesterRg: string;
  requesterSexo: string;
  requesterDob: string;
  requesterAddress: string;
  requesterCep: string;
  requesterEstado: string;
  requesterMunicipio: string;
  requesterPhone: string;
  requesterLandline: string;
};
