/**
 * Document Helpers — Pure logic for the Documentos page.
 *
 * Extracted so each function can be unit-tested without React/Firebase.
 * Used by: src/app/(app)/documentos/page.tsx
 */

import type { DocumentRecord } from '@/types';

// ─── getPatientName ─────────────────────────────────────────────────────────

/**
 * Returns the display name for a document's patient/holder.
 * Priority: holder → metadata.fullName → fallback string.
 */
export function getPatientName(
  doc: Pick<DocumentRecord, 'holder' | 'metadata'>,
  fallback = '(sem paciente)',
): string {
  return doc.holder || (doc.metadata?.fullName as string) || fallback;
}

// ─── Search filtering ───────────────────────────────────────────────────────

/**
 * Returns true if a document matches the search term.
 * Checks: holder, metadata.fullName, number, key (case-insensitive includes).
 */
export function matchesSearch(
  doc: Pick<DocumentRecord, 'holder' | 'metadata' | 'number' | 'key'>,
  searchTerm: string,
): boolean {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  const fields = [
    doc.holder,
    doc.metadata?.fullName as string | undefined,
    doc.number,
    doc.key,
  ];
  return fields.some((f) => f && f.toLowerCase().includes(term));
}

// ─── Prescription expiry ────────────────────────────────────────────────────

export type ExpiryStatus = 'valid' | 'expiring' | 'expired';

/**
 * Determines the expiry status of a prescription based on its prescriptionDate.
 *
 * Rules (from CEO plan):
 *   - "Vencida" (expired, red): prescriptionDate > 6 months ago
 *   - "Vencendo" (warning, amber): prescriptionDate between 5 and 6 months ago
 *   - No badge (valid): prescriptionDate < 5 months ago
 *
 * @param prescriptionDate — ISO date string (e.g. "2025-09-15") or undefined
 * @param now — reference date for "today" (injectable for testing)
 * @returns ExpiryStatus or null if no prescriptionDate provided
 */
export function getPrescriptionExpiry(
  prescriptionDate: string | undefined | null,
  now: Date = new Date(),
): ExpiryStatus | null {
  if (!prescriptionDate) return null;

  const rxDate = new Date(prescriptionDate);
  if (isNaN(rxDate.getTime())) return null;

  const diffMs = now.getTime() - rxDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // > 6 months (~183 days) → expired
  if (diffDays > 183) return 'expired';
  // > 5 months (~152 days) → expiring (within 30 days of expiry)
  if (diffDays > 152) return 'expiring';
  // Otherwise → valid
  return 'valid';
}

// ─── Archiving ──────────────────────────────────────────────────────────────

interface ArchivableDoc {
  type: string;
  prescriptionDate?: string;
  createdAt?: unknown;
}

/**
 * Given a list of documents for ONE patient, marks older prescriptions as archived.
 * Returns the same array with an `archived` boolean flag on each doc.
 *
 * Rules:
 *   - Only applies to type === 'prescription'
 *   - If a patient has multiple prescriptions, the most recent one (by prescriptionDate,
 *     falling back to createdAt) is active. All others are archived.
 *   - Non-prescription docs are never archived.
 */
export function markArchivedDocs<T extends ArchivableDoc>(
  docs: T[],
): (T & { archived: boolean })[] {
  const prescriptions = docs.filter((d) => d.type === 'prescription');

  if (prescriptions.length <= 1) {
    // No archiving needed — 0 or 1 prescription
    return docs.map((d) => ({ ...d, archived: false }));
  }

  // Find the "newest" prescription
  const getDateKey = (d: ArchivableDoc): number => {
    if (d.prescriptionDate) return new Date(d.prescriptionDate).getTime();
    const ts = d.createdAt as { seconds?: number } | null | undefined;
    return (ts?.seconds ?? 0) * 1000;
  };

  let newestIdx = 0;
  let newestTime = getDateKey(prescriptions[0]);
  for (let i = 1; i < prescriptions.length; i++) {
    const t = getDateKey(prescriptions[i]);
    if (t > newestTime) {
      newestTime = t;
      newestIdx = i;
    }
  }
  const newestPrescription = prescriptions[newestIdx];

  return docs.map((d) => ({
    ...d,
    archived: d.type === 'prescription' && d !== newestPrescription,
  }));
}
