'use client';

import { useMemo, useCallback } from "react";
import { AdjustmentList, mergeDocPages } from "@/components/anvisa/request-components";
import { useDoc, useFirebase, useMemoFirebase } from "@/firebase";
import { useOcrExtraction } from "@/hooks/anvisa/use-ocr-extraction";
import { usePatientNameDetection } from "@/hooks/anvisa/use-patient-name-detection";
import type {
  PatientRequest,
  PacienteDocument,
  ComprovanteResidenciaDocument,
  ProcuracaoDocument,
  ReceitaMedicaDocument,
  DocumentBase,
  OcrData,
} from "@/types/anvisa";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { Loader2, AlertCircle, FileText, MapPin, Stethoscope, CheckCircle2 } from "lucide-react";
import { use, useState, useEffect, useRef } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ANVISA_COLLECTIONS, ANVISA_SUBCOLLECTIONS } from "@/lib/anvisa-paths";
import { useSalesIntegrationCheck } from "@/hooks/anvisa/use-sales-integration-check";
import { DuplicatePrescriptionDialog, SimilarEntityDialog, NewEntityDialog } from "@/components/anvisa/sales-integration-dialogs";
import type { ReuseDecision } from "@/components/anvisa/sales-integration-dialogs";
import { clientToOcrData, doctorToOcrData, salesDateToAnvisaDate } from "@/lib/anvisa-matching-utils";
import type { Client } from "@/types/client";
import type { Doctor } from "@/types/doctor";

type DialogStep = 'none' | 'duplicate_prescription' | 'similar_patient' | 'similar_doctor' | 'new_patient' | 'new_doctor';

type LoadingStep = {
  label: string;
  icon: React.ReactNode;
  done: boolean;
};

export default function RequestDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { firestore, storage } = useFirebase();

  const requestRef = useMemoFirebase(() => {
    if (!id || !firestore) return null;
    return doc(firestore, ANVISA_COLLECTIONS.requests, id);
  }, [id, firestore]);
  const { data: request, isLoading: isLoadingRequest } = useDoc<PatientRequest>(requestRef);

  // Helper to load multiple documents by IDs with real-time listeners.
  function useMultipleDocs<T>(
    subcollection: string,
    docIds: string[] | undefined,
    fallbackId: string | undefined,
  ) {
    const [docs, setDocs] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      if (!firestore || !request) {
        setIsLoading(false);
        return;
      }

      const ids = docIds?.length
        ? docIds
        : fallbackId
          ? [fallbackId]
          : [];

      if (ids.length === 0) {
        setDocs([]);
        setIsLoading(false);
        return;
      }

      const docMap = new Map<string, T>();
      let initialLoadCount = 0;

      const unsubscribes = ids.map((docId) => {
        const docRef = doc(firestore, ANVISA_COLLECTIONS.requests, id, subcollection, docId);
        return onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            docMap.set(docId, snap.data() as T);
          } else {
            docMap.delete(docId);
          }
          setDocs(ids.map(i => docMap.get(i)).filter(Boolean) as T[]);

          initialLoadCount++;
          if (initialLoadCount >= ids.length) {
            setIsLoading(false);
          }
        }, (error) => {
          console.error(`Error listening to ${subcollection}/${docId}:`, error);
          initialLoadCount++;
          if (initialLoadCount >= ids.length) {
            setIsLoading(false);
          }
        });
      });

      return () => unsubscribes.forEach(unsub => unsub());
    }, [firestore, request, id, subcollection, docIds, fallbackId]);

    return { docs, isLoading };
  }

  // Load all documents per type
  const { docs: pacienteDocs, isLoading: isLoadingPaciente } =
    useMultipleDocs<PacienteDocument>(ANVISA_SUBCOLLECTIONS.pacienteDocuments, request?.pacienteDocumentIds, request?.pacienteDocumentId);
  const pacienteDoc = pacienteDocs[0] ?? null;

  const { docs: comprovanteResidenciaDocs, isLoading: isLoadingComprovante } =
    useMultipleDocs<ComprovanteResidenciaDocument>(ANVISA_SUBCOLLECTIONS.comprovanteResidenciaDocuments, request?.comprovanteResidenciaDocumentIds, request?.comprovanteResidenciaDocumentId);
  const comprovanteResidenciaDoc = comprovanteResidenciaDocs[0] ?? null;

  const { docs: procuracaoDocs, isLoading: isLoadingProcuracao } =
    useMultipleDocs<ProcuracaoDocument>(ANVISA_SUBCOLLECTIONS.procuracaoDocuments, request?.procuracaoDocumentIds, request?.procuracaoDocumentId);
  const procuracaoDoc = procuracaoDocs[0] ?? null;

  const { docs: receitaMedicaDocs, isLoading: isLoadingReceita } =
    useMultipleDocs<ReceitaMedicaDocument>(ANVISA_SUBCOLLECTIONS.receitaMedicaDocuments, request?.receitaMedicaDocumentIds, request?.receitaMedicaDocumentId);
  const receitaMedicaDoc = receitaMedicaDocs[0] ?? null;

  const { isExtracting, extractionError, isWaitingForOcr } = useOcrExtraction(
    id,
    pacienteDocs,
    comprovanteResidenciaDocs,
    procuracaoDocs,
    receitaMedicaDocs,
    firestore ?? null,
    storage ?? null
  );

  // Auto-detect patient name from extracted fields and update the request
  usePatientNameDetection(
    id,
    request ?? null,
    pacienteDoc ?? null,
    comprovanteResidenciaDoc ?? null,
    receitaMedicaDoc ?? null,
    firestore ?? null
  );

  const isLoading = isLoadingRequest || isLoadingPaciente || isLoadingComprovante || isLoadingProcuracao || isLoadingReceita;

  // Progress bar steps
  const loadingSteps: LoadingStep[] = useMemo(() => [
    { label: 'Solicitacao', icon: <FileText className="h-4 w-4" />, done: !isLoadingRequest },
    { label: 'Doc. Paciente', icon: <FileText className="h-4 w-4" />, done: !isLoadingPaciente },
    { label: 'Comp. Residencia', icon: <MapPin className="h-4 w-4" />, done: !isLoadingComprovante },
    { label: 'Doc. Adicional', icon: <FileText className="h-4 w-4" />, done: !isLoadingProcuracao },
    { label: 'Receita Medica', icon: <Stethoscope className="h-4 w-4" />, done: !isLoadingReceita },
  ], [isLoadingRequest, isLoadingPaciente, isLoadingComprovante, isLoadingProcuracao, isLoadingReceita]);

  const loadingProgress = useMemo(() => {
    const completed = loadingSteps.filter(s => s.done).length;
    return Math.round((completed / loadingSteps.length) * 100);
  }, [loadingSteps]);

  // Are we still processing (OCR or AI extraction)?
  const isProcessing = isWaitingForOcr || isExtracting;

  // ── Sales Integration database check ─────────────────────────────────
  const mergedOcr = useMemo<Partial<OcrData> | null>(() => {
    if (isProcessing) return null;
    const allDocs: DocumentBase[] = [
      ...pacienteDocs,
      ...comprovanteResidenciaDocs,
      ...receitaMedicaDocs,
      ...procuracaoDocs,
    ];
    if (allDocs.length === 0) return null;
    const { fields } = mergeDocPages(allDocs);
    const hasData = Object.values(fields).some(v => v && v.trim().length > 0);
    if (!hasData) return null;
    return fields as Partial<OcrData>;
  }, [isProcessing, pacienteDocs, comprovanteResidenciaDocs, receitaMedicaDocs, procuracaoDocs]);

  const salesCheck = useSalesIntegrationCheck(mergedOcr, firestore ?? null);

  // Dialog state machine
  const [dialogStep, setDialogStep] = useState<DialogStep>('none');
  const [reusedData, setReusedData] = useState<Partial<OcrData> | undefined>(undefined);
  const [skipPatientDialogs, setSkipPatientDialogs] = useState(false);
  const [skipDoctorDialogs, setSkipDoctorDialogs] = useState(false);
  const dialogInitRef = useRef(false);

  // Compute the next entity dialog to show after a given step
  const getNextEntityStep = useCallback((
    afterStep?: DialogStep,
    overrides?: { skipPatient?: boolean; skipDoctor?: boolean },
  ): DialogStep => {
    const skipP = overrides?.skipPatient ?? skipPatientDialogs;
    const skipD = overrides?.skipDoctor ?? skipDoctorDialogs;
    const steps: DialogStep[] = [];

    if (!skipP) {
      if (salesCheck.clientMatches.length > 0) {
        steps.push('similar_patient');
      } else if (!salesCheck.clientExactMatch && mergedOcr?.patientName) {
        steps.push('new_patient');
      }
    }
    if (!skipD) {
      if (salesCheck.doctorMatches.length > 0) {
        steps.push('similar_doctor');
      } else if (!salesCheck.doctorExactMatch && mergedOcr?.doctorName) {
        steps.push('new_doctor');
      }
    }

    if (!afterStep) return steps[0] || 'none';
    const idx = steps.indexOf(afterStep);
    return steps[idx + 1] || 'none';
  }, [salesCheck, mergedOcr, skipPatientDialogs, skipDoctorDialogs]);

  // Initialize the dialog sequence when the check completes
  useEffect(() => {
    if (!salesCheck.hasChecked || dialogInitRef.current) return;
    dialogInitRef.current = true;
    if (salesCheck.prescriptionMatches.length > 0) {
      setDialogStep('duplicate_prescription');
    } else {
      setDialogStep(getNextEntityStep());
    }
  }, [salesCheck.hasChecked, getNextEntityStep]);

  // Dialog handlers
  const handleDialogCancel = useCallback(() => {
    setDialogStep('none');
  }, []);

  const handleProceedNew = useCallback(() => {
    setDialogStep(getNextEntityStep());
  }, [getNextEntityStep]);

  const handleReuseData = useCallback(async (decision: ReuseDecision) => {
    if (!firestore) return;
    const data: Partial<OcrData> = {};
    let skipP = false;
    let skipD = false;

    if (decision.reusePatient) {
      skipP = true;
      try {
        const snap = await getDoc(doc(firestore, 'clients', decision.selectedMatch.clientId));
        if (snap.exists()) {
          Object.assign(data, clientToOcrData({ id: snap.id, ...snap.data() } as Client));
        }
      } catch (err) {
        console.error('Failed to fetch client for reuse:', err);
      }
    }

    if (decision.reuseDoctor) {
      skipD = true;
      try {
        const snap = await getDoc(doc(firestore, 'doctors', decision.selectedMatch.doctorId));
        if (snap.exists()) {
          Object.assign(data, doctorToOcrData({ id: snap.id, ...snap.data() } as Doctor));
        }
      } catch (err) {
        console.error('Failed to fetch doctor for reuse:', err);
      }
    }

    if (decision.reusePrescription && decision.selectedMatch.prescriptionDate) {
      data.prescriptionDate = salesDateToAnvisaDate(decision.selectedMatch.prescriptionDate);
    }

    setReusedData(data);
    setSkipPatientDialogs(prev => prev || skipP);
    setSkipDoctorDialogs(prev => prev || skipD);
    setDialogStep(getNextEntityStep(undefined, { skipPatient: skipP, skipDoctor: skipD }));
  }, [firestore, getNextEntityStep]);

  // Build comparison data for SimilarEntityDialog
  const extractedPatientData = useMemo<Record<string, string>>(() => {
    if (!mergedOcr) return {};
    const keys = ['patientName', 'patientCpf', 'patientRg', 'patientDob', 'patientPhone', 'patientEmail', 'patientCity', 'patientState'] as const;
    const result: Record<string, string> = {};
    for (const k of keys) { if (mergedOcr[k]) result[k] = mergedOcr[k]!; }
    return result;
  }, [mergedOcr]);

  const extractedDoctorData = useMemo<Record<string, string>>(() => {
    if (!mergedOcr) return {};
    const keys = ['doctorName', 'doctorCrm', 'doctorSpecialty', 'doctorUf', 'doctorCity', 'doctorPhone', 'doctorMobile', 'doctorEmail'] as const;
    const result: Record<string, string> = {};
    for (const k of keys) { if (mergedOcr[k]) result[k] = mergedOcr[k]!; }
    return result;
  }, [mergedOcr]);

  const existingPatientData = useMemo<Record<string, string>>(() => {
    const client = salesCheck.clientMatches[0];
    if (!client) return {};
    const ocrData = clientToOcrData(client);
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(ocrData)) { if (v) result[k] = v; }
    return result;
  }, [salesCheck.clientMatches]);

  const existingDoctorData = useMemo<Record<string, string>>(() => {
    const doctor = salesCheck.doctorMatches[0];
    if (!doctor) return {};
    const ocrData = doctorToOcrData(doctor);
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(ocrData)) { if (v) result[k] = v; }
    return result;
  }, [salesCheck.doctorMatches]);

  if (isLoading) {
    return (
        <div className="flex flex-col items-center justify-center h-full p-8 max-w-md mx-auto">
            <div className="w-full space-y-6">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="mt-3 text-sm font-medium text-foreground">Carregando solicitacao</p>
                    <p className="text-xs text-muted-foreground mt-1">Buscando dados dos documentos...</p>
                </div>
                <Progress value={loadingProgress} className="h-2" />
                <div className="space-y-2">
                    {loadingSteps.map((step) => (
                        <div key={step.label} className="flex items-center gap-3 text-sm">
                            <div className={`transition-colors ${step.done ? 'text-green-600' : 'text-muted-foreground'}`}>
                                {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
                            </div>
                            <span className={`transition-colors ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {step.label}
                            </span>
                            {!step.done && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  }

  if (!request || !pacienteDoc || !comprovanteResidenciaDoc || !receitaMedicaDoc) {
    return <div className="flex justify-center items-center h-full p-6"><p>Solicitacao nao encontrada ou dados incompletos.</p></div>;
  }

  return (
    <div>
      {isWaitingForOcr && (
        <Alert className="mb-6 bg-blue-50 border-blue-200 text-blue-900">
          <Loader2 className="h-4 w-4 animate-spin !text-blue-600" />
          <AlertTitle>Aguardando processamento OCR...</AlertTitle>
          <AlertDescription>
            O Google Cloud Vision esta lendo o texto dos documentos. A extracao de campos iniciara automaticamente em seguida.
          </AlertDescription>
        </Alert>
      )}
      {isExtracting && (
        <Alert className="mb-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Extraindo dados dos documentos...</AlertTitle>
          <AlertDescription>
            A IA esta analisando os documentos para preencher os campos automaticamente.
          </AlertDescription>
        </Alert>
      )}
      {extractionError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro na extracao</AlertTitle>
          <AlertDescription>{extractionError}</AlertDescription>
        </Alert>
      )}
      {salesCheck.isChecking && (
        <Alert className="mb-6 bg-purple-50 border-purple-200 text-purple-900">
          <Loader2 className="h-4 w-4 animate-spin !text-purple-600" />
          <AlertTitle>Verificando no sistema de vendas...</AlertTitle>
          <AlertDescription>
            Buscando dados de paciente, medico e receitas no banco de dados.
          </AlertDescription>
        </Alert>
      )}

      {/* Sales Integration Dialogs */}
      <DuplicatePrescriptionDialog
        open={dialogStep === 'duplicate_prescription'}
        matches={salesCheck.prescriptionMatches}
        onProceedNew={handleProceedNew}
        onReuseData={handleReuseData}
        onCancel={handleDialogCancel}
      />
      {dialogStep === 'similar_patient' && salesCheck.clientMatches[0] && (
        <SimilarEntityDialog
          open
          entityType="patient"
          extractedData={extractedPatientData}
          existingData={existingPatientData}
          existingName={salesCheck.clientMatches[0].fullName}
          onConfirmMatch={() => setDialogStep(getNextEntityStep('similar_patient'))}
          onDismiss={() => setDialogStep(getNextEntityStep('similar_patient'))}
        />
      )}
      {dialogStep === 'similar_doctor' && salesCheck.doctorMatches[0] && (
        <SimilarEntityDialog
          open
          entityType="doctor"
          extractedData={extractedDoctorData}
          existingData={existingDoctorData}
          existingName={salesCheck.doctorMatches[0].fullName}
          onConfirmMatch={() => setDialogStep(getNextEntityStep('similar_doctor'))}
          onDismiss={() => setDialogStep(getNextEntityStep('similar_doctor'))}
        />
      )}
      {dialogStep === 'new_patient' && mergedOcr && (
        <NewEntityDialog
          open
          entityType="patient"
          ocrData={mergedOcr}
          firestore={firestore ?? null}
          onAdded={() => setDialogStep(getNextEntityStep('new_patient'))}
          onSkip={() => setDialogStep(getNextEntityStep('new_patient'))}
        />
      )}
      {dialogStep === 'new_doctor' && mergedOcr && (
        <NewEntityDialog
          open
          entityType="doctor"
          ocrData={mergedOcr}
          firestore={firestore ?? null}
          onAdded={() => setDialogStep(getNextEntityStep('new_doctor'))}
          onSkip={() => setDialogStep(getNextEntityStep('new_doctor'))}
        />
      )}

      <AdjustmentList
        request={request}
        pacienteDoc={pacienteDoc}
        pacienteDocs={pacienteDocs}
        comprovanteResidenciaDoc={comprovanteResidenciaDoc}
        comprovanteResidenciaDocs={comprovanteResidenciaDocs}
        procuracaoDoc={procuracaoDoc}
        procuracaoDocs={procuracaoDocs}
        receitaMedicaDoc={receitaMedicaDoc}
        receitaMedicaDocs={receitaMedicaDocs}
        isProcessing={isProcessing}
        reusedData={reusedData}
      />
    </div>
  );
}
