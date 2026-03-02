'use client';

import { useEffect, useRef } from 'react';
import { doc, updateDoc, Firestore } from 'firebase/firestore';
import type {
  PatientRequest,
  PacienteDocument,
  ComprovanteResidenciaDocument,
  ReceitaMedicaDocument,
  OcrData,
} from '@/types/anvisa';
import { ANVISA_COLLECTIONS } from '@/lib/anvisa-paths';

/**
 * Automatically detects the patient name from OCR-extracted fields
 * across multiple document types and updates the request's patientDisplayName.
 *
 * Priority: ID card (DOCUMENTO_PACIENTE) > proof of residency > prescription
 */
export function usePatientNameDetection(
  requestId: string,
  request: PatientRequest | null,
  pacienteDoc: PacienteDocument | null,
  comprovanteResidenciaDoc: ComprovanteResidenciaDocument | null,
  receitaMedicaDoc: ReceitaMedicaDocument | null,
  firestore: Firestore | null,
) {
  const hasUpdated = useRef(false);

  useEffect(() => {
    if (!firestore || !request || !requestId) return;
    if (hasUpdated.current) return;

    const currentName = request.patientDisplayName || '';
    const isPlaceholder = !currentName || currentName === '(Identificando...)';
    if (!isPlaceholder) return;

    const docsToCheck = [pacienteDoc, comprovanteResidenciaDoc, receitaMedicaDoc].filter(Boolean);

    let detectedName = '';
    for (const d of docsToCheck) {
      if (!d) continue;
      try {
        const fields: OcrData = JSON.parse(d.extractedFields || '{}');
        if (fields.patientName && fields.patientName.trim().length > 0) {
          detectedName = fields.patientName.trim();
          break;
        }
      } catch {
        /* ignore parse errors */
      }
    }

    if (!detectedName) return;

    hasUpdated.current = true;
    const requestRef = doc(firestore, ANVISA_COLLECTIONS.requests, requestId);
    updateDoc(requestRef, {
      patientDisplayName: detectedName,
      updatedAt: new Date().toISOString(),
    }).catch((error) => {
      console.error('Failed to update patient display name:', error);
      hasUpdated.current = false;
    });
  }, [firestore, request, requestId, pacienteDoc, comprovanteResidenciaDoc, receitaMedicaDoc]);
}
