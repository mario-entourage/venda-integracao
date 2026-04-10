'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { doc, writeBatch, Firestore } from 'firebase/firestore';
import { ref, getDownloadURL, getMetadata, FirebaseStorage } from 'firebase/storage';
import type {
  PacienteDocument,
  ComprovanteResidenciaDocument,
  ProcuracaoDocument,
  ReceitaMedicaDocument,
  AnvisaDocumentType,
  DocumentBase,
} from '@/types/anvisa';
import type { ExtractOcrFieldsInput, ExtractOcrFieldsOutput } from '@/ai/flows/anvisa/extract-ocr-fields';
import { ANVISA_API_ROUTES } from '@/lib/anvisa-routes';
import { ANVISA_COLLECTIONS, ANVISA_SUBCOLLECTIONS } from '@/lib/anvisa-paths';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

type DocumentWithType = {
  doc: PacienteDocument | ComprovanteResidenciaDocument | ProcuracaoDocument | ReceitaMedicaDocument;
  type: AnvisaDocumentType;
  subcollection: string;
};

const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  DOCUMENTO_PACIENTE: ['patientRg', 'patientDob', 'patientState'],
  COMPROVANTE_RESIDENCIA: ['patientState', 'patientCity'],
  PROCURACAO: ['patientRg', 'patientDob'],
};

const DOC_TYPE_LABELS: Record<string, string> = {
  DOCUMENTO_PACIENTE: 'Doc. Paciente',
  COMPROVANTE_RESIDENCIA: 'Comp. Residência',
  PROCURACAO: 'Procuração',
  RECEITA_MEDICA: 'Receita Médica',
};

function needsExtraction(document: { extractedFields: string }, documentType?: string): boolean {
  try {
    const parsed = JSON.parse(document.extractedFields || '{}');
    if (Object.keys(parsed).length === 0) return true;
    if (documentType && REQUIRED_FIELDS_BY_TYPE[documentType]) {
      const requiredFields = REQUIRED_FIELDS_BY_TYPE[documentType];
      if (requiredFields.some((f) => !parsed[f])) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isOcrReady(document: DocumentBase): boolean {
  if (document.ocrStatus === 'completed') return true;
  if (document.ocrStatus === 'error') return true;
  if (document.ocrTextChunks && document.ocrTextChunks.length > 0 && document.ocrTextChunks[0].length > 0) {
    return true;
  }
  // If ocrStatus is not set or still 'pending', the Cloud Function either hasn't
  // been deployed or hasn't processed the document yet. Proceed with Gemini
  // extraction directly from the file URL — ocrText is optional.
  if (!document.ocrStatus || document.ocrStatus === 'pending') return true;
  return false;
}

type AuthFetchFn = (url: string, options?: RequestInit & { timeout?: number }) => Promise<Response>;

async function extractWithRetry(
  item: DocumentWithType,
  storage: FirebaseStorage,
  authFetch: AuthFetchFn,
  maxAttempts: number = 2,
): Promise<{ item: DocumentWithType; result: ExtractOcrFieldsOutput }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const storageRef = ref(storage, item.doc.fileStoragePath);
      const [fileUrl, metadata] = await Promise.all([
        getDownloadURL(storageRef),
        getMetadata(storageRef),
      ]);
      const contentType = metadata.contentType || 'application/octet-stream';
      const ocrText = item.doc.ocrTextChunks?.join('\n') || undefined;

      const extractInput: ExtractOcrFieldsInput = {
        documentType: item.type,
        fileUrl,
        contentType,
        ocrText,
      };

      console.log(`[OCR] Attempt ${attempt}/${maxAttempts} for ${DOC_TYPE_LABELS[item.type]} "${item.doc.fileName}"`);

      const response = await authFetch(ANVISA_API_ROUTES.extractOcrFields, {
        method: 'POST',
        body: JSON.stringify(extractInput),
        timeout: 60_000,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ''}`);
      }

      const result: ExtractOcrFieldsOutput = await response.json();
      console.log(`[OCR] Success for "${item.doc.fileName}": ${Object.keys(result.extractedFields).length} fields, ${result.missingCriticalFields.length} missing`);
      return { item, result };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[OCR] Attempt ${attempt} failed for "${item.doc.fileName}":`, lastError.message);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  throw new Error(
    `${DOC_TYPE_LABELS[item.type] || item.type} "${item.doc.fileName}": ${lastError?.message || 'erro desconhecido'}`,
  );
}

export function useOcrExtraction(
  requestId: string,
  pacienteDocs: PacienteDocument[],
  comprovanteResidenciaDocs: ComprovanteResidenciaDocument[],
  procuracaoDocs: ProcuracaoDocument[],
  receitaMedicaDocs: ReceitaMedicaDocument[],
  firestore: Firestore | null,
  storage: FirebaseStorage | null,
) {
  const authFetch = useAuthFetch();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const extractedDocIds = useRef<Set<string>>(new Set());
  const isRunning = useRef(false);

  const allDocsLoaded = !!(
    pacienteDocs.length > 0 &&
    comprovanteResidenciaDocs.length > 0 &&
    receitaMedicaDocs.length > 0
  );

  const allPages: DocumentBase[] = useMemo(
    () => [...pacienteDocs, ...comprovanteResidenciaDocs, ...receitaMedicaDocs, ...procuracaoDocs],
    [pacienteDocs, comprovanteResidenciaDocs, receitaMedicaDocs, procuracaoDocs],
  );

  const allOcrReady = allDocsLoaded && allPages.every(isOcrReady);
  const isWaitingForOcr = allDocsLoaded && !allOcrReady;

  const docStateKey = useMemo(() => {
    return allPages
      .map((d) => `${d.id}:${d.ocrStatus || ''}:${(d.extractedFields || '').length}`)
      .join('|');
  }, [allPages]);

  useEffect(() => {
    if (!firestore || !storage) return;
    if (
      pacienteDocs.length === 0 ||
      comprovanteResidenciaDocs.length === 0 ||
      receitaMedicaDocs.length === 0
    )
      return;
    if (isRunning.current) return;
    if (!allOcrReady) return;

    const documentsToProcess: DocumentWithType[] = [];

    for (const pDoc of pacienteDocs) {
      if (needsExtraction(pDoc, 'DOCUMENTO_PACIENTE') && !extractedDocIds.current.has(pDoc.id)) {
        documentsToProcess.push({
          doc: pDoc,
          type: 'DOCUMENTO_PACIENTE',
          subcollection: ANVISA_SUBCOLLECTIONS.pacienteDocuments,
        });
      }
    }
    for (const crDoc of comprovanteResidenciaDocs) {
      if (
        needsExtraction(crDoc, 'COMPROVANTE_RESIDENCIA') &&
        !extractedDocIds.current.has(crDoc.id)
      ) {
        documentsToProcess.push({
          doc: crDoc,
          type: 'COMPROVANTE_RESIDENCIA',
          subcollection: ANVISA_SUBCOLLECTIONS.comprovanteResidenciaDocuments,
        });
      }
    }
    for (const pDoc of procuracaoDocs) {
      if (needsExtraction(pDoc, 'PROCURACAO') && !extractedDocIds.current.has(pDoc.id)) {
        documentsToProcess.push({
          doc: pDoc,
          type: 'PROCURACAO',
          subcollection: ANVISA_SUBCOLLECTIONS.procuracaoDocuments,
        });
      }
    }
    for (const rDoc of receitaMedicaDocs) {
      if (needsExtraction(rDoc, 'RECEITA_MEDICA') && !extractedDocIds.current.has(rDoc.id)) {
        documentsToProcess.push({
          doc: rDoc,
          type: 'RECEITA_MEDICA',
          subcollection: ANVISA_SUBCOLLECTIONS.receitaMedicaDocuments,
        });
      }
    }

    if (documentsToProcess.length === 0) return;

    isRunning.current = true;
    setIsExtracting(true);
    setExtractionError(null);

    (async () => {
      try {
        const results = await Promise.allSettled(
          documentsToProcess.map((item) => extractWithRetry(item, storage, authFetch)),
        );

        const batch = writeBatch(firestore);
        let hasUpdates = false;

        for (const settled of results) {
          if (settled.status === 'fulfilled') {
            const {
              item: { doc: docData, subcollection },
              result,
            } = settled.value;
            const docRef = doc(
              firestore,
              ANVISA_COLLECTIONS.requests,
              requestId,
              subcollection,
              docData.id,
            );

            let existingFields: Record<string, unknown> = {};
            let existingConfidence: Record<string, unknown> = {};
            try {
              existingFields = JSON.parse(docData.extractedFields || '{}');
              existingConfidence = JSON.parse(
                (docData as DocumentBase & { fieldConfidence?: string }).fieldConfidence || '{}',
              );
            } catch {
              /* ignore parse errors */
            }

            const mergedFields = { ...existingFields, ...result.extractedFields };
            const mergedConfidence = { ...existingConfidence, ...result.fieldConfidence };

            batch.update(docRef, {
              extractedFields: JSON.stringify(mergedFields),
              fieldConfidence: JSON.stringify(mergedConfidence),
              missingCriticalFields: result.missingCriticalFields,
            });
            hasUpdates = true;

            extractedDocIds.current.add(docData.id);
          }
        }

        if (hasUpdates) {
          await batch.commit();
        }

        const failures = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        if (failures.length > 0) {
          const failDetails = failures
            .map((f) => f.reason?.message || 'Erro desconhecido')
            .join('; ');
          console.error('Some extractions failed:', failDetails);
          setExtractionError(failDetails);
        }
      } catch (error) {
        console.error('OCR extraction batch failed:', error);
        setExtractionError('Falha ao extrair dados dos documentos.');
      } finally {
        setIsExtracting(false);
        isRunning.current = false;
      }
    })();
  }, [firestore, storage, requestId, docStateKey, allOcrReady, authFetch]);

  return { isExtracting, extractionError, isWaitingForOcr };
}
