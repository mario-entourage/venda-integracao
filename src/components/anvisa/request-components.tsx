
"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { AlertCircle, CheckCircle, Lightbulb, Loader2, Wand2, Check, ExternalLink, ZoomIn, ZoomOut, RotateCw, X, Maximize2, FileText, Copy } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, writeBatch, updateDoc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { useFirebase, errorEmitter } from "@/firebase";
import { FirestorePermissionError } from "@/firebase/errors";
import { useToast } from "@/hooks/use-toast";
import { getDownloadURL, ref } from "firebase/storage";
import Image from 'next/image';


import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PatientRequest, PacienteDocument, ComprovanteResidenciaDocument, ProcuracaoDocument, ReceitaMedicaDocument, DocumentBase, OcrData, AnvisaRequestStatus, AnvisaUserProfile } from "@/types/anvisa";
import { ANVISA_ROUTES, ANVISA_API_ROUTES } from "@/lib/anvisa-routes";
import { ANVISA_COLLECTIONS } from "@/lib/anvisa-paths";

// ─── Phone formatting ───────────────────────────────────────────────────────

/** Formats digits into (XX) XXXXX-XXXX (mobile) or (XX) XXXX-XXXX (landline). */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ─── CEP-to-state derivation ────────────────────────────────────────────────
// CEP range → UF mapping (first 1-2 digits determine the state)
function stateFromCep(cep: string | undefined | null): string {
    if (!cep) return '';
    const digits = cep.replace(/\D/g, '');
    if (digits.length < 5) return '';
    const prefix = parseInt(digits.substring(0, 5), 10);
    // SP: 01000-19999
    if (prefix >= 1000 && prefix <= 19999) return 'SP';
    // RJ: 20000-28999
    if (prefix >= 20000 && prefix <= 28999) return 'RJ';
    // ES: 29000-29999
    if (prefix >= 29000 && prefix <= 29999) return 'ES';
    // MG: 30000-39999
    if (prefix >= 30000 && prefix <= 39999) return 'MG';
    // BA: 40000-48999
    if (prefix >= 40000 && prefix <= 48999) return 'BA';
    // SE: 49000-49999
    if (prefix >= 49000 && prefix <= 49999) return 'SE';
    // PE: 50000-56999
    if (prefix >= 50000 && prefix <= 56999) return 'PE';
    // AL: 57000-57999
    if (prefix >= 57000 && prefix <= 57999) return 'AL';
    // PB: 58000-58999
    if (prefix >= 58000 && prefix <= 58999) return 'PB';
    // RN: 59000-59999
    if (prefix >= 59000 && prefix <= 59999) return 'RN';
    // CE: 60000-63999
    if (prefix >= 60000 && prefix <= 63999) return 'CE';
    // PI: 64000-64999
    if (prefix >= 64000 && prefix <= 64999) return 'PI';
    // MA: 65000-65999
    if (prefix >= 65000 && prefix <= 65999) return 'MA';
    // PA: 66000-68899
    if (prefix >= 66000 && prefix <= 68899) return 'PA';
    // AP: 68900-68999
    if (prefix >= 68900 && prefix <= 68999) return 'AP';
    // AM: 69000-69299, 69400-69899
    if (prefix >= 69000 && prefix <= 69299) return 'AM';
    if (prefix >= 69400 && prefix <= 69899) return 'AM';
    // RR: 69300-69399
    if (prefix >= 69300 && prefix <= 69399) return 'RR';
    // AC: 69900-69999
    if (prefix >= 69900 && prefix <= 69999) return 'AC';
    // DF: 70000-72799, 73000-73699
    if (prefix >= 70000 && prefix <= 72799) return 'DF';
    if (prefix >= 73000 && prefix <= 73699) return 'DF';
    // GO: 72800-72999, 73700-76799
    if (prefix >= 72800 && prefix <= 72999) return 'GO';
    if (prefix >= 73700 && prefix <= 76799) return 'GO';
    // TO: 77000-77999
    if (prefix >= 77000 && prefix <= 77999) return 'TO';
    // MT: 78000-78899
    if (prefix >= 78000 && prefix <= 78899) return 'MT';
    // MS: 79000-79999
    if (prefix >= 79000 && prefix <= 79999) return 'MS';
    // RO: 76800-76999
    if (prefix >= 76800 && prefix <= 76999) return 'RO';
    // PR: 80000-87999
    if (prefix >= 80000 && prefix <= 87999) return 'PR';
    // SC: 88000-89999
    if (prefix >= 88000 && prefix <= 89999) return 'SC';
    // RS: 90000-99999
    if (prefix >= 90000 && prefix <= 99999) return 'RS';
    return '';
}

// Optional format validation: validates format only when a value is provided
const optionalDate = z.string().refine(
  (val) => !val || /^\d{2}\/\d{2}\/\d{4}$/.test(val),
  "Formato inválido (DD/MM/AAAA)."
);
const optionalCpf = z.string().refine(
  (val) => !val || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(val),
  "Formato inválido (000.000.000-00)."
);
const optionalCep = z.string().refine(
  (val) => !val || /^\d{5}-\d{3}$/.test(val),
  "Formato inválido (00000-000)."
);
const optionalUf = z.string().refine(
  (val) => !val || val.length === 2,
  "UF deve ter 2 caracteres."
);
const optionalEmail = z.string().refine(
  (val) => !val || z.string().email().safeParse(val).success,
  "Email inválido."
);

const optionalPhone = z.string().refine(
  (val) => !val || /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(val.replace(/\s/g, '')),
  "Formato inválido. Ex: (31) 99999-9999"
);

const ocrSchema = z.object({
  patientName: z.string().default(''),
  patientRg: z.string().default(''),
  patientDob: optionalDate.default(''),
  patientCpf: optionalCpf.default(''),
  patientCep: optionalCep.default(''),
  patientAddress: z.string().default(''),
  patientCity: z.string().default(''),
  patientState: optionalUf.default(''),
  patientPhone: optionalPhone.default(''),
  patientEmail: optionalEmail.default(''),
  doctorName: z.string().default(''),
  doctorCrm: z.string().default(''),
  doctorSpecialty: z.string().default(''),
  doctorUf: optionalUf.default(''),
  doctorCity: z.string().default(''),
  doctorPhone: z.string().default(''),
  doctorMobile: optionalPhone.default(''),
  doctorEmail: optionalEmail.default(''),
  prescriptionDate: optionalDate.default(''),
  prescriptionMedication: z.string().default(''),
  prescriptionDosage: z.string().default(''),
});

// All field keys for completeness tracking
const allFieldKeys = Object.keys(ocrSchema.shape) as (keyof z.infer<typeof ocrSchema>)[];

// Confidence thresholds for field highlighting
const CONFIDENCE_LOW = 0.7;   // below this → pale red
const CONFIDENCE_MED = 0.85;  // below this → pale yellow

/** Returns a background class based on the confidence score for a field. */
function confidenceClass(confidence: number | undefined): string {
  if (confidence === undefined) return '';
  if (confidence < CONFIDENCE_LOW) return 'bg-red-50 border-red-200';
  if (confidence < CONFIDENCE_MED) return 'bg-yellow-50 border-yellow-200';
  return '';
}

/**
 * Merges extractedFields and fieldConfidence across multiple pages of the same
 * document type. For each field, keeps the value with the highest confidence.
 */
export function mergeDocPages(docs: DocumentBase[]): { fields: Record<string, string>; confidence: Record<string, number> } {
  const fields: Record<string, string> = {};
  const confidence: Record<string, number> = {};

  for (const d of docs) {
    let parsed: Record<string, string> = {};
    let conf: Record<string, number> = {};
    try { parsed = JSON.parse(d.extractedFields || '{}'); } catch { /* ignore */ }
    try { conf = JSON.parse(d.fieldConfidence || '{}'); } catch { /* ignore */ }

    for (const [key, value] of Object.entries(parsed)) {
      if (!value || String(value).trim().length === 0) continue;
      const newConf = conf[key] ?? 0.5;
      const existingConf = confidence[key] ?? -1;
      // Keep whichever page has higher confidence, or fill in missing fields
      if (!fields[key] || newConf > existingConf) {
        fields[key] = value;
        confidence[key] = newConf;
      }
    }
  }

  return { fields, confidence };
}

type DocumentProps = {
  pacienteDoc: PacienteDocument;
  pacienteDocs?: PacienteDocument[];
  comprovanteResidenciaDoc: ComprovanteResidenciaDocument;
  comprovanteResidenciaDocs?: ComprovanteResidenciaDocument[];
  procuracaoDoc: ProcuracaoDocument | null;
  procuracaoDocs?: ProcuracaoDocument[];
  receitaMedicaDoc: ReceitaMedicaDocument;
  receitaMedicaDocs?: ReceitaMedicaDocument[];
}

const fieldLabels: Record<string, string> = {
  patientName: 'Nome do Paciente',
  patientRg: 'RG do Paciente (Nº Doc. Identificação)',
  patientCpf: 'CPF do Paciente',
  patientDob: 'Data de Nasc. do Paciente',
  patientCep: 'CEP do Paciente',
  patientAddress: 'Endereço do Paciente',
  patientCity: 'Município do Paciente',
  patientState: 'Estado do Paciente',
  patientPhone: 'Celular do Paciente',
  patientEmail: 'E-mail do Paciente',
  doctorName: 'Nome do Prescritor',
  doctorCrm: 'Nº do CRM/CRO',
  doctorSpecialty: 'Especialidade',
  doctorUf: 'Estado do Prescritor',
  doctorCity: 'Município do Prescritor',
  doctorPhone: 'Telefone Fixo do Prescritor',
  doctorMobile: 'Celular do Prescritor',
  doctorEmail: 'E-mail para Contato',
  prescriptionDate: 'Data da Receita',
  prescriptionMedication: 'Produto / Medicamento',
  prescriptionDosage: 'Posologia / Dosagem',
};

function useEmptyFields(
  pacienteDocs: PacienteDocument[],
  comprovanteResidenciaDocs: ComprovanteResidenciaDocument[],
  procuracaoDocs: ProcuracaoDocument[],
  receitaMedicaDocs: ReceitaMedicaDocument[],
) {
  return useMemo(() => {
    const allDocs: DocumentBase[] = [...pacienteDocs, ...comprovanteResidenciaDocs, ...receitaMedicaDocs, ...procuracaoDocs];
    const { fields: combinedData } = mergeDocPages(allDocs);
    return allFieldKeys.filter(key => !combinedData[key]);
  }, [pacienteDocs, comprovanteResidenciaDocs, procuracaoDocs, receitaMedicaDocs]);
}

function CorrectionSuggestions({ pacienteDocs = [], comprovanteResidenciaDocs = [], procuracaoDocs = [], receitaMedicaDocs = [], pacienteDoc, comprovanteResidenciaDoc, procuracaoDoc, receitaMedicaDoc, isProcessing }: DocumentProps & { isProcessing?: boolean }) {
  const pDocs = pacienteDocs.length > 0 ? pacienteDocs : [pacienteDoc];
  const crDocs = comprovanteResidenciaDocs.length > 0 ? comprovanteResidenciaDocs : [comprovanteResidenciaDoc];
  const prDocs = procuracaoDocs.length > 0 ? procuracaoDocs : (procuracaoDoc ? [procuracaoDoc] : []);
  const rDocs = receitaMedicaDocs.length > 0 ? receitaMedicaDocs : [receitaMedicaDoc];
  const emptyFields = useEmptyFields(pDocs, crDocs, prDocs, rDocs);

  // Don't show the "missing fields" warning while still processing OCR / AI extraction
  if (isProcessing) {
    return (
        <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-900">
            <Loader2 className="h-4 w-4 animate-spin !text-blue-600"/>
            <AlertTitle>Processando documentos...</AlertTitle>
            <AlertDescription>
                Aguarde enquanto a IA lê e extrai os dados dos documentos enviados.
            </AlertDescription>
        </Alert>
    );
  }

  if (emptyFields.length === 0) {
    return (
        <Alert variant="default" className="bg-green-50 border-green-200 text-green-900">
            <CheckCircle className="h-4 w-4 !text-green-600"/>
            <AlertTitle>Todos os campos foram preenchidos</AlertTitle>
            <AlertDescription>
                Todos os campos foram preenchidos pela IA. Revise os dados e salve.
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <Alert variant="default" className="bg-amber-50 border-amber-200 text-amber-900">
        <AlertCircle className="h-4 w-4 !text-amber-600" />
        <AlertTitle>Campos não preenchidos ({emptyFields.length})</AlertTitle>
        <AlertDescription>
          A IA não conseguiu extrair os seguintes campos. Preencha-os manualmente se necessário, ou prossiga mesmo assim:
          <ul className="list-disc pl-6 mt-2">
            {emptyFields.map(field => <li key={field}>{(fieldLabels[field] || field)} (<a href={`#${field}`} className="underline">Ir para o campo</a>)</li>)}
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SuggestionBox({
    fieldName,
    suggestions,
    isSuggesting,
    onApply,
}: {
    fieldName: string;
    suggestions: Record<string, string>;
    isSuggesting: boolean;
    onApply: (value: string) => void;
}) {
    const suggestion = suggestions[fieldName];

    if (isSuggesting && !suggestion) {
        return (
            <p className="text-xs text-muted-foreground flex items-center pt-1">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Gerando sugestão...
            </p>
        );
    }

    if (suggestion) {
        return (
            <div className="flex items-center justify-between gap-2 p-2 mt-2 bg-accent/50 border border-accent rounded-md">
                <p className="text-sm text-accent-foreground flex items-center">
                    <Lightbulb className="h-4 w-4 mr-2" />
                    Sugestão: <span className="font-semibold ml-1">{suggestion}</span>
                </p>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-background h-7"
                    onClick={() => onApply(suggestion)}
                >
                    Aplicar
                </Button>
            </div>
        );
    }

    return null;
}

function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={handleCopy}
            disabled={!value}
            title="Copiar"
        >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
        </Button>
    );
}

type OcrDataFormProps = DocumentProps & {
    request: PatientRequest;
    reusedData?: Partial<OcrData>;
};

function OcrDataForm({ request, pacienteDoc, pacienteDocs = [], comprovanteResidenciaDoc, comprovanteResidenciaDocs = [], procuracaoDoc, procuracaoDocs = [], receitaMedicaDoc, receitaMedicaDocs = [], reusedData }: OcrDataFormProps) {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [suggestions, setSuggestions] = useState<Record<string, string>>({});
    const [isSuggesting, setIsSuggesting] = useState(false);

    // Merge all pages per type for comprehensive field coverage
    const allDocs: DocumentBase[] = [
        ...(pacienteDocs.length > 0 ? pacienteDocs : [pacienteDoc]),
        ...(comprovanteResidenciaDocs.length > 0 ? comprovanteResidenciaDocs : [comprovanteResidenciaDoc]),
        ...(receitaMedicaDocs.length > 0 ? receitaMedicaDocs : [receitaMedicaDoc]),
        ...(procuracaoDocs.length > 0 ? procuracaoDocs : (procuracaoDoc ? [procuracaoDoc] : [])),
    ];

    useEffect(() => {
        const getSuggestions = async () => {
            setIsSuggesting(true);
            try {
                const { fields: combinedData, confidence: combinedConfidence } = mergeDocPages(allDocs);

                // Don't request suggestions if there's no extracted data to work with
                const hasAnyData = Object.values(combinedData).some(v => v && String(v).trim().length > 0);
                if (!hasAnyData) {
                    setIsSuggesting(false);
                    return;
                }

                const missingFields = [...new Set(
                    allDocs.flatMap(d => d.missingCriticalFields || [])
                )];

                const input = {
                    extractedData: combinedData,
                    confidenceScores: combinedConfidence,
                    missingFields: missingFields,
                };

                const response = await fetch(ANVISA_API_ROUTES.suggestCorrections, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input),
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch suggestions');
                }
                const result = await response.json();

                // Filter out placeholder/fabricated suggestions
                const placeholderPatterns = [
                    /^0{3,}/, // 000...
                    /^12345/, // 12345-678 etc
                    /^(jo[aã]o|maria|fulano|ciclano|beltrano)/i, // common fake names
                    /^exemplo/i,
                    /^teste/i,
                    /^xx/i,
                ];
                const filtered: Record<string, string> = {};
                for (const [key, value] of Object.entries(result)) {
                    if (!value || typeof value !== 'string' || !value.trim()) continue;
                    // Skip if suggestion is identical to current extracted data
                    if (combinedData[key] === value) continue;
                    // Skip if suggestion matches a placeholder pattern
                    const isPlaceholder = placeholderPatterns.some(p => p.test(value.trim()));
                    if (isPlaceholder) continue;
                    filtered[key] = value;
                }
                setSuggestions(filtered);

            } catch (error) {
                console.error("Failed to get AI suggestions:", error);
                toast({
                    variant: 'destructive',
                    title: 'Erro ao buscar sugestões',
                    description: 'Não foi possível obter sugestões da IA.',
                });
            } finally {
                setIsSuggesting(false);
            }
        };

        getSuggestions();
    }, [pacienteDoc, comprovanteResidenciaDoc, procuracaoDoc, receitaMedicaDoc, toast]);

    // Parse combined confidence scores from all documents
    const confidenceMap = useMemo<Record<string, number>>(() => {
        const { confidence } = mergeDocPages(allDocs);
        return confidence;
    }, [allDocs]);

    const defaultValues = useMemo(() => {
        const { fields: combinedData } = mergeDocPages(allDocs);
        // OCR-extracted data takes priority; database (reusedData) fills gaps
        const db = reusedData || {};

        return {
            patientName: combinedData.patientName || db.patientName || '',
            patientRg: combinedData.patientRg || db.patientRg || '',
            patientCpf: combinedData.patientCpf || db.patientCpf || '',
            patientDob: combinedData.patientDob || db.patientDob || '',
            patientCep: combinedData.patientCep || db.patientCep || '',
            patientAddress: combinedData.patientAddress || db.patientAddress || '',
            patientCity: combinedData.patientCity || db.patientCity || '',
            patientState: combinedData.patientState || db.patientState || stateFromCep(combinedData.patientCep || db.patientCep) || '',
            patientPhone: combinedData.patientPhone || db.patientPhone || '',
            patientEmail: combinedData.patientEmail || db.patientEmail || '',
            doctorName: combinedData.doctorName || db.doctorName || '',
            doctorCrm: combinedData.doctorCrm || db.doctorCrm || '',
            doctorSpecialty: combinedData.doctorSpecialty || db.doctorSpecialty || '',
            doctorUf: combinedData.doctorUf || db.doctorUf || '',
            doctorCity: combinedData.doctorCity || db.doctorCity || '',
            doctorPhone: combinedData.doctorPhone || db.doctorPhone || '',
            doctorMobile: combinedData.doctorMobile || db.doctorMobile || '',
            doctorEmail: combinedData.doctorEmail || db.doctorEmail || '',
            prescriptionDate: combinedData.prescriptionDate || db.prescriptionDate || '',
            prescriptionMedication: combinedData.prescriptionMedication || db.prescriptionMedication || '',
            prescriptionDosage: combinedData.prescriptionDosage || db.prescriptionDosage || '',
        };
    }, [allDocs, reusedData]);

    const form = useForm<z.infer<typeof ocrSchema>>({
        resolver: zodResolver(ocrSchema),
        defaultValues: defaultValues,
    });

    useEffect(() => {
        // Only update fields the user hasn't manually edited (non-dirty),
        // so user-typed values are never overwritten by incoming OCR/DB data.
        const dirtyFields = form.formState.dirtyFields;
        const currentValues = form.getValues();
        const merged = { ...currentValues };
        for (const key of Object.keys(defaultValues) as (keyof typeof defaultValues)[]) {
            if (!dirtyFields[key]) {
                merged[key] = defaultValues[key];
            }
        }
        form.reset(merged, { keepDirtyValues: true });
    }, [defaultValues, form]);

    async function onSubmit(data: z.infer<typeof ocrSchema>) {
        if (!firestore) {
            toast({ variant: 'destructive', title: 'Erro de Conexão', description: 'Não foi possível conectar ao banco de dados.' });
            return;
        }

        setIsSaving(true);

        const patientFields: Partial<OcrData> = {
            patientName: data.patientName,
            patientRg: data.patientRg,
            patientCpf: data.patientCpf,
            patientDob: data.patientDob,
            patientCep: data.patientCep,
            patientAddress: data.patientAddress,
            patientCity: data.patientCity,
            patientState: data.patientState,
            patientPhone: data.patientPhone,
            patientEmail: data.patientEmail,
        };

        const prescriptionFields: Partial<OcrData> = {
            doctorName: data.doctorName,
            doctorCrm: data.doctorCrm,
            doctorSpecialty: data.doctorSpecialty,
            doctorUf: data.doctorUf,
            doctorCity: data.doctorCity,
            doctorPhone: data.doctorPhone,
            doctorMobile: data.doctorMobile,
            doctorEmail: data.doctorEmail,
            prescriptionDate: data.prescriptionDate,
            prescriptionMedication: data.prescriptionMedication,
            prescriptionDosage: data.prescriptionDosage,
        };

        const allPossibleFields = Object.keys(ocrSchema.shape);
        const allMissing = [
            ...(pacienteDoc.missingCriticalFields || []),
            ...(comprovanteResidenciaDoc.missingCriticalFields || []),
            ...(procuracaoDoc?.missingCriticalFields || []),
            ...(receitaMedicaDoc.missingCriticalFields || []),
        ];
        const stillMissing = allMissing.filter(f => {
            const key = f as keyof typeof data;
            return allPossibleFields.includes(f) && !data[key];
        });

        const patientMissing = (pacienteDoc.missingCriticalFields || []).filter(f => stillMissing.includes(f));
        const comprovanteMissing = (comprovanteResidenciaDoc.missingCriticalFields || []).filter(f => stillMissing.includes(f));
        const receitaMissing = (receitaMedicaDoc.missingCriticalFields || []).filter(f => stillMissing.includes(f));

        const batch = writeBatch(firestore);

        const pacienteDocRef = doc(firestore, ANVISA_COLLECTIONS.requests, request.id, "pacienteDocuments", pacienteDoc.id);
        batch.update(pacienteDocRef, {
            extractedFields: JSON.stringify(patientFields),
            missingCriticalFields: patientMissing
        });

        const comprovanteResidenciaDocRef = doc(firestore, ANVISA_COLLECTIONS.requests, request.id, "comprovanteResidenciaDocuments", comprovanteResidenciaDoc.id);
        batch.update(comprovanteResidenciaDocRef, {
            extractedFields: JSON.stringify(patientFields),
            missingCriticalFields: comprovanteMissing
        });

        const receitaMedicaDocRef = doc(firestore, ANVISA_COLLECTIONS.requests, request.id, "receitaMedicaDocuments", receitaMedicaDoc.id);
        batch.update(receitaMedicaDocRef, {
            extractedFields: JSON.stringify(prescriptionFields),
            missingCriticalFields: receitaMissing
        });

        const requestRef = doc(firestore, ANVISA_COLLECTIONS.requests, request.id);
        const requestUpdatePayload: { updatedAt: string, status?: AnvisaRequestStatus } = {
            updatedAt: new Date().toISOString()
        };

        if (request.status === 'RASCUNHO' || request.status === 'PENDENTE') {
            requestUpdatePayload.status = 'EM_AJUSTE';
        }

        batch.update(requestRef, requestUpdatePayload);

        batch.commit()
            .then(() => {
                toast({
                    title: "Sucesso!",
                    description: "Dados da solicitação foram salvos com sucesso.",
                });
            })
            .catch((error) => {
                const permissionError = new FirestorePermissionError({
                    path: `requests/${request.id}`,
                    operation: 'write',
                    requestResourceData: {
                        patientFields,
                        prescriptionFields,
                        requestUpdatePayload,
                    },
                });
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => {
                setIsSaving(false);
            });
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Dados do Paciente</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        {/* ANVISA form order: Nome, CPF, DOB, CEP, Endereço, Município, Estado, Celular, E-mail */}
                        <FormField control={form.control} name="patientName" render={({ field }) => (
                            <FormItem id="patientName" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientName)}`}>
                                <FormLabel>Nome Completo</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientName" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientName', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientRg" render={({ field }) => (
                            <FormItem id="patientRg" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientRg)}`}>
                                <FormLabel>Nº do Documento de Identificação (RG)</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="MG-12.345.678"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientRg" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientRg', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientCpf" render={({ field }) => (
                            <FormItem id="patientCpf" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientCpf)}`}>
                                <FormLabel>CPF</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="000.000.000-00" /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientCpf" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientCpf', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientDob" render={({ field }) => (
                            <FormItem id="patientDob" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientDob)}`}>
                                <FormLabel>Data de Nascimento</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="DD/MM/AAAA"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientDob" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientDob', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientCep" render={({ field }) => (
                            <FormItem id="patientCep" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientCep)}`}>
                                <FormLabel>CEP</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="00000-000"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientCep" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientCep', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientAddress" render={({ field }) => (
                            <FormItem id="patientAddress" className={`md:col-span-2 rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientAddress)}`}>
                                <FormLabel>Endereço Completo</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="Rua das Flores, 123, Apto 4"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientAddress" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientAddress', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientCity" render={({ field }) => (
                            <FormItem id="patientCity" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientCity)}`}>
                                <FormLabel>Município</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="Ex: Belo Horizonte"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientCity" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientCity', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientState" render={({ field }) => (
                            <FormItem id="patientState" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientState)}`}>
                                <FormLabel>Estado (UF)</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="MG" maxLength={2}/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientState" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientState', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientPhone" render={({ field }) => (
                            <FormItem id="patientPhone" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientPhone)}`}>
                                <FormLabel>Celular</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="(00) 00000-0000" onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientPhone" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientPhone', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="patientEmail" render={({ field }) => (
                            <FormItem id="patientEmail" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.patientEmail)}`}>
                                <FormLabel>E-mail do Paciente</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="paciente@email.com"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="patientEmail" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('patientEmail', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Dados do Prescritor / Receita</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        {/* ANVISA form order: Nome, CRM/CRO, Especialidade, Estado, Município, Tel Fixo, Celular, Email, Data */}
                        <FormField control={form.control} name="doctorName" render={({ field }) => (
                            <FormItem id="doctorName" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorName)}`}>
                                <FormLabel>Nome do Profissional</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorName" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorName', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="doctorCrm" render={({ field }) => (
                            <FormItem id="doctorCrm" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorCrm)}`}>
                                <FormLabel>Nº do CRM/CRO</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorCrm" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorCrm', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="doctorSpecialty" render={({ field }) => (
                             <FormItem id="doctorSpecialty" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorSpecialty)}`}>
                                <FormLabel>Especialidade</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorSpecialty" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorSpecialty', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="doctorUf" render={({ field }) => (
                            <FormItem id="doctorUf" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorUf)}`}>
                                <FormLabel>Estado do Prescritor</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="MG" maxLength={2}/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorUf" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorUf', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="doctorCity" render={({ field }) => (
                            <FormItem id="doctorCity" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorCity)}`}>
                                <FormLabel>Município do Prescritor</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="Ex: Belo Horizonte"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorCity" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorCity', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="doctorPhone" render={({ field }) => (
                            <FormItem id="doctorPhone" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorPhone)}`}>
                                <FormLabel>Telefone Fixo do Prescritor</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="(00) 0000-0000" onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorPhone" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorPhone', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="doctorMobile" render={({ field }) => (
                            <FormItem id="doctorMobile" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorMobile)}`}>
                                <FormLabel>Celular do Prescritor</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="(00) 00000-0000" onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorMobile" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorMobile', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="doctorEmail" render={({ field }) => (
                             <FormItem id="doctorEmail" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.doctorEmail)}`}>
                                <FormLabel>E-mail para Contato</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="medico@email.com"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="doctorEmail" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('doctorEmail', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="prescriptionMedication" render={({ field }) => (
                            <FormItem id="prescriptionMedication" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.prescriptionMedication)}`}>
                                <FormLabel>Produto / Medicamento</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="Ex: Canabidiol 200mg/ml"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="prescriptionMedication" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('prescriptionMedication', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="prescriptionDosage" render={({ field }) => (
                            <FormItem id="prescriptionDosage" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.prescriptionDosage)}`}>
                                <FormLabel>Posologia / Dosagem</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="Ex: 20 gotas 2x ao dia"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="prescriptionDosage" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('prescriptionDosage', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="prescriptionDate" render={({ field }) => (
                            <FormItem id="prescriptionDate" className={`rounded-md p-2 -m-2 ${confidenceClass(confidenceMap.prescriptionDate)}`}>
                                <FormLabel>Data da Receita</FormLabel>
                                <div className="flex items-center gap-1">
                                    <FormControl><Input {...field} placeholder="DD/MM/AAAA"/></FormControl>
                                    <CopyButton value={field.value} />
                                </div>
                                <SuggestionBox fieldName="prescriptionDate" suggestions={suggestions} isSuggesting={isSuggesting} onApply={(v) => form.setValue('prescriptionDate', v)} />
                                <FormMessage />
                            </FormItem>
                        )} />
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" type="button" onClick={() => onSubmit(form.getValues())} disabled={isSaving}>
                        Salvar Rascunho
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Validar e Salvar
                    </Button>
                </div>
            </form>
        </Form>
    );
}

function AutomationHelper({ request, pacienteDoc, pacienteDocs = [], comprovanteResidenciaDoc, comprovanteResidenciaDocs = [], procuracaoDoc, procuracaoDocs = [], receitaMedicaDoc, receitaMedicaDocs = [], isProcessing }: AdjustmentListProps) {
    const { firestore, storage, user } = useFirebase();
    const { toast } = useToast();

    // Merge all pages per type for comprehensive field coverage
    const allAutomationDocs: DocumentBase[] = [
        ...(pacienteDocs.length > 0 ? pacienteDocs : [pacienteDoc]),
        ...(comprovanteResidenciaDocs.length > 0 ? comprovanteResidenciaDocs : [comprovanteResidenciaDoc]),
        ...(receitaMedicaDocs.length > 0 ? receitaMedicaDocs : [receitaMedicaDoc]),
        ...(procuracaoDocs.length > 0 ? procuracaoDocs : (procuracaoDoc ? [procuracaoDoc] : [])),
    ];
    const [confirmationNumber, setConfirmationNumber] = useState('');
    const [isCompleting, setIsCompleting] = useState(false);
    const [dataSentToExtension, setDataSentToExtension] = useState(false);
    const dataSentRef = useRef(false);
    const [autoSent, setAutoSent] = useState(false);
    const [extensionReady, setExtensionReady] = useState(false);
    const [userProfile, setUserProfile] = useState<AnvisaUserProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);

    // Fetch user profile for requester fields
    useEffect(() => {
        async function loadProfile() {
            if (!firestore || !user) return;
            try {
                const profileRef = doc(firestore, ANVISA_COLLECTIONS.userProfiles, user.uid);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    setUserProfile(profileSnap.data() as AnvisaUserProfile);
                }
            } catch (error) {
                console.error('Error loading user profile for automation:', error);
            } finally {
                setProfileLoaded(true);
            }
        }
        loadProfile();
    }, [firestore, user]);

    // Listen for extension bridge ready signal + confirmation that extension stored data
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!event.data || typeof event.data !== 'object') return;
            if (event.data.type === 'anvisa-extension-ready') {
                setExtensionReady(true);
                return;
            }
            if (event.data.type === 'anvisa-extension-data-stored') {
                if (event.data.success) {
                    setDataSentToExtension(true);
                    dataSentRef.current = true;
                    toast({
                        title: "Dados enviados para a extensão!",
                        description: `${event.data.fieldCount} campos prontos. Abra o site da ANVISA e clique em "Preencher" na extensão.`,
                    });
                    setTimeout(() => { setDataSentToExtension(false); dataSentRef.current = false; }, 5000);
                } else {
                    toast({
                        variant: 'destructive',
                        title: "Erro ao enviar para extensão",
                        description: event.data.error || "Recarregue esta página (F5) e tente novamente.",
                    });
                }
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [toast]);

    const validatedData = useMemo(() => {
        const { fields } = mergeDocPages(allAutomationDocs);
        return fields as Partial<OcrData>;
    }, [allAutomationDocs]);

    // Merge patient/doctor data with requester profile
    const fullPayload = useMemo(() => {
        const data: Record<string, string | undefined> = { ...validatedData };
        if (userProfile) {
            data.requesterName = userProfile.requesterName;
            data.requesterEmail = userProfile.requesterEmail;
            data.requesterRg = userProfile.requesterRg;
            data.requesterSexo = userProfile.requesterSexo;
            data.requesterDob = userProfile.requesterDob;
            data.requesterAddress = userProfile.requesterAddress;
            data.requesterCep = userProfile.requesterCep;
            data.requesterEstado = userProfile.requesterEstado;
            data.requesterMunicipio = userProfile.requesterMunicipio;
            data.requesterPhone = userProfile.requesterPhone;
            data.requesterLandline = userProfile.requesterLandline;
        }
        return data;
    }, [validatedData, userProfile]);

    // Resolve Firebase Storage download URLs for all documents
    type FileEntry = { docType: string; fileName: string; downloadUrl: string; mimeType: string };
    const [resolvedFiles, setResolvedFiles] = useState<FileEntry[]>([]);

    useEffect(() => {
        if (!storage || isProcessing) return;

        const docsByType: { doc: DocumentBase; docType: string }[] = [];

        const pDocs = pacienteDocs.length > 0 ? pacienteDocs : [pacienteDoc];
        pDocs.forEach(d => { if (d?.fileStoragePath) docsByType.push({ doc: d, docType: 'DOCUMENTO_PACIENTE' }); });

        const crDocs = comprovanteResidenciaDocs.length > 0 ? comprovanteResidenciaDocs : [comprovanteResidenciaDoc];
        crDocs.forEach(d => { if (d?.fileStoragePath) docsByType.push({ doc: d, docType: 'COMPROVANTE_RESIDENCIA' }); });

        const rmDocs = receitaMedicaDocs.length > 0 ? receitaMedicaDocs : [receitaMedicaDoc];
        rmDocs.forEach(d => { if (d?.fileStoragePath) docsByType.push({ doc: d, docType: 'RECEITA_MEDICA' }); });

        const prDocs = procuracaoDocs.length > 0 ? procuracaoDocs : (procuracaoDoc ? [procuracaoDoc] : []);
        prDocs.forEach(d => { if (d?.fileStoragePath) docsByType.push({ doc: d, docType: 'PROCURACAO' }); });

        if (docsByType.length === 0) return;

        let cancelled = false;
        Promise.all(
            docsByType.map(async (entry) => {
                try {
                    const storageRef = ref(storage, entry.doc.fileStoragePath);
                    const url = await getDownloadURL(storageRef);
                    const fn = entry.doc.fileName.toLowerCase();
                    const mimeType = fn.endsWith('.pdf') ? 'application/pdf'
                        : fn.endsWith('.png') ? 'image/png'
                        : fn.endsWith('.jpg') || fn.endsWith('.jpeg') ? 'image/jpeg'
                        : 'application/octet-stream';
                    return { docType: entry.docType, fileName: entry.doc.fileName, downloadUrl: url, mimeType } as FileEntry;
                } catch {
                    return null;
                }
            })
        ).then((results) => {
            if (!cancelled) setResolvedFiles(results.filter((r): r is FileEntry => r !== null));
        });

        return () => { cancelled = true; };
    }, [storage, isProcessing, pacienteDoc, pacienteDocs, comprovanteResidenciaDoc, comprovanteResidenciaDocs, receitaMedicaDoc, receitaMedicaDocs, procuracaoDoc, procuracaoDocs]);

    // Full payload including file URLs for the extension
    const extensionPayload = useMemo(() => {
        const payload: Record<string, unknown> = { ...fullPayload };
        if (resolvedFiles.length > 0) {
            payload._files = resolvedFiles;
        }
        return payload;
    }, [fullPayload, resolvedFiles]);

    // Probe for extension bridge — it may have sent 'ready' before this component mounted.
    // The bridge re-sends 'ready' in response to a ping.
    useEffect(() => {
        window.postMessage({ type: 'anvisa-extension-ping' }, '*');
    }, []);

    // Auto-send data to extension once OCR/extraction is done, profile is loaded, AND bridge is ready
    useEffect(() => {
        if (autoSent || isProcessing || !profileLoaded || !extensionReady) return;
        const hasData = Object.values(validatedData).some(v => v && String(v).trim().length > 0);
        if (!hasData) return;
        setAutoSent(true);
        window.postMessage({ type: 'anvisa-autofill-data', data: extensionPayload }, '*');
    }, [validatedData, isProcessing, autoSent, profileLoaded, extensionReady, extensionPayload]);

    const handleSendToExtension = () => {
        // Use postMessage to cross the content script isolation boundary
        window.postMessage(
            { type: 'anvisa-autofill-data', data: extensionPayload },
            '*'
        );

        // If the extension bridge doesn't reply within 3 seconds, the content script
        // is likely dead (extension was reinstalled/updated). Prompt user to refresh.
        // Use dataSentRef (not state) to avoid stale closure issues.
        const timeout = setTimeout(() => {
            if (!dataSentRef.current) {
                toast({
                    variant: 'destructive',
                    title: 'Extensão não respondeu',
                    description: 'Recarregue esta página (F5) e tente novamente. A extensão pode ter sido reinstalada.',
                });
            }
        }, 3000);
    };

    const handleCompleteRequest = () => {
        if (!firestore || isCompleting) return;
        if (!confirmationNumber.trim()) {
            toast({ variant: 'destructive', title: 'Campo Obrigatório', description: 'Por favor, insira o número de confirmação da ANVISA.' });
            return;
        }

        setIsCompleting(true);
        const requestRef = doc(firestore, ANVISA_COLLECTIONS.requests, request.id);
        const payload = {
            status: 'CONCLUIDO' as AnvisaRequestStatus,
            confirmationNumber: confirmationNumber.trim(),
            updatedAt: new Date().toISOString(),
        };

        updateDoc(requestRef, payload)
            .then(() => {
                toast({
                    title: "Solicitação Concluída!",
                    description: "A solicitação foi marcada como concluída com sucesso.",
                });
            })
            .catch((error) => {
                 const contextualError = new FirestorePermissionError({
                    path: requestRef.path,
                    operation: 'update',
                    requestResourceData: payload,
                });
                errorEmitter.emit('permission-error', contextualError);
            })
            .finally(() => {
                setIsCompleting(false);
            });
    }

    const filledCount = Object.values(validatedData).filter(v => v && String(v).trim().length > 0).length;

    return (
        <div className="space-y-6">
            {profileLoaded && !userProfile && (
                <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Modelo Solicitante não configurado</AlertTitle>
                    <AlertDescription>
                        Configure o{' '}
                        <Link href={ANVISA_ROUTES.profile} className="underline text-primary font-medium">Modelo Solicitante</Link>{' '}
                        para preencher automaticamente os dados do solicitante no formulário ANVISA.
                    </AlertDescription>
                </Alert>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>Preencher Formulário ANVISA</CardTitle>
                    <CardDescription>
                        Envie os dados para a extensão e preencha o formulário automaticamente.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                        <a href="https://solicitacao.servicos.gov.br/processos/iniciar?codServico=2925" target="_blank" rel="noopener noreferrer" className="block">
                            <Button variant="outline" className="w-full h-auto py-4">
                                <div className="flex flex-col items-center gap-2">
                                    <ExternalLink className="h-5 w-5" />
                                    <span className="text-sm font-medium">Abrir site da ANVISA</span>
                                    <span className="text-xs text-muted-foreground">Abre em nova aba</span>
                                </div>
                            </Button>
                        </a>

                        <Button
                            variant={dataSentToExtension ? "outline" : "default"}
                            className="w-full h-auto py-4"
                            onClick={handleSendToExtension}
                        >
                            <div className="flex flex-col items-center gap-2">
                                {dataSentToExtension
                                    ? <Check className="h-5 w-5 text-green-600" />
                                    : isProcessing
                                        ? <Loader2 className="h-5 w-5 animate-spin" />
                                        : <Wand2 className="h-5 w-5" />
                                }
                                <span className="text-sm font-medium">
                                    {dataSentToExtension ? 'Dados enviados!' : isProcessing ? 'Aguardando OCR...' : 'Reenviar para extensão'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {dataSentToExtension
                                        ? 'Clique em "Preencher" na extensão'
                                        : isProcessing
                                            ? 'Envio automático ao concluir'
                                            : `${filledCount} campos prontos`
                                    }
                                </span>
                            </div>
                        </Button>
                    </div>

                    {dataSentToExtension && (
                        <Alert className="bg-green-50 border-green-200 text-green-900">
                            <CheckCircle className="h-4 w-4 !text-green-600" />
                            <AlertTitle>Dados prontos na extensão</AlertTitle>
                            <AlertDescription className="space-y-1 text-sm">
                                <p>1. Abra o site da ANVISA na aba ao lado</p>
                                <p>2. Clique no ícone da extensão <strong>ANVISA Auto-Fill</strong> na barra do navegador</p>
                                <p>3. Clique em <strong>&ldquo;Preencher Formulário&rdquo;</strong></p>
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Finalizar Solicitação</CardTitle>
                    <CardDescription>Após submeter no site da ANVISA, insira o número de confirmação abaixo.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Label htmlFor="confirmation-number">Número de Confirmação ANVISA</Label>
                    <Input
                        id="confirmation-number"
                        placeholder="Cole o número de confirmação aqui"
                        value={confirmationNumber}
                        onChange={(e) => setConfirmationNumber(e.target.value)}
                        disabled={isCompleting}
                    />
                </CardContent>
                <CardFooter>
                    <Button onClick={handleCompleteRequest} disabled={isCompleting}>
                        {isCompleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
                        {isCompleting ? 'Finalizando...' : 'Finalizar Solicitação'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

function ZoomableImage({
    url,
    fileName,
    isFullscreen = false
}: {
    url: string;
    fileName: string;
    isFullscreen?: boolean;
}) {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 4));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
    const handleRotate = () => setRotation(prev => (prev + 90) % 360);
    const handleReset = () => {
        setZoom(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && zoom > 1) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            handleZoomIn();
        } else {
            handleZoomOut();
        }
    };

    const containerHeight = isFullscreen ? 'h-[80vh]' : 'h-[60vh]';

    return (
        <div className="space-y-2">
            {/* Zoom Controls */}
            <div className="flex items-center justify-center gap-2 p-2 bg-muted rounded-md">
                <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.5}>
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[60px] text-center">
                    {Math.round(zoom * 100)}%
                </span>
                <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 4}>
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-border mx-2" />
                <Button variant="outline" size="sm" onClick={handleRotate}>
                    <RotateCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset}>
                    Resetar
                </Button>
            </div>

            {/* Image Container */}
            <div
                className={`relative ${containerHeight} border rounded-lg overflow-hidden bg-muted/50 select-none`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
            >
                <div
                    className="absolute inset-0 flex items-center justify-center transition-transform duration-100"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={url}
                        alt={`Visualização de ${fileName}`}
                        className="max-w-full max-h-full object-contain pointer-events-none"
                        draggable={false}
                    />
                </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
                Use a roda do mouse para zoom, ou arraste para navegar quando ampliado
            </p>
        </div>
    );
}

function DocumentPlaceholder() {
    return (
        <div className="flex flex-col items-center justify-center p-12 h-96 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/20">
            <div className="relative">
                {/* Abstract document icon */}
                <div className="w-20 h-28 bg-gradient-to-b from-gray-100 to-gray-200 rounded-sm border border-gray-300 shadow-sm relative">
                    {/* Corner fold */}
                    <div className="absolute top-0 right-0 w-5 h-5 bg-gray-300 rounded-bl-sm" />
                    <div className="absolute top-0 right-0 w-5 h-5 bg-white rounded-bl-sm -translate-x-px translate-y-px" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }} />
                    {/* Abstract text lines */}
                    <div className="absolute top-8 left-2.5 right-4 space-y-1.5">
                        <div className="h-1.5 bg-gray-300 rounded-full w-full" />
                        <div className="h-1.5 bg-gray-300 rounded-full w-3/4" />
                        <div className="h-1.5 bg-gray-300 rounded-full w-5/6" />
                        <div className="h-1.5 bg-gray-300 rounded-full w-2/3" />
                        <div className="h-1.5 bg-gray-300 rounded-full w-full" />
                        <div className="h-1.5 bg-gray-300 rounded-full w-1/2" />
                    </div>
                </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Nenhum documento enviado</p>
        </div>
    );
}

function DocumentViewer({ filePath, fileName }: { filePath: string; fileName: string }) {
    const { storage } = useFirebase();
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

    useEffect(() => {
        if (!storage || !filePath) {
            setIsLoading(false);
            return;
        };
        const storageRef = ref(storage, filePath);
        getDownloadURL(storageRef)
          .then((downloadUrl) => {
            setUrl(downloadUrl);
          })
          .catch((e) => {
            console.error("Error getting document URL", e);
            setError("Não foi possível carregar o documento.");
          })
          .finally(() => {
            setIsLoading(false);
          });
    }, [storage, filePath]);

    // No file path at all — show placeholder
    if (!filePath) {
        return <DocumentPlaceholder />;
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8 h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Carregando documento...</p>
            </div>
        );
    }

    if (error || !url) {
        return (
            <div className="flex items-center justify-center p-8 h-96 bg-muted rounded-md">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="ml-4 text-destructive">{error || "URL do documento não encontrada."}</p>
            </div>
        );
    }

    const isPdf = fileName.toLowerCase().endsWith('.pdf');

    // For PDFs, use iframe with built-in zoom
    if (isPdf) {
        return (
            <div className="space-y-2">
                <div className="flex justify-end">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                            <Maximize2 className="h-4 w-4 mr-2" />
                            Abrir em nova aba
                        </Button>
                    </a>
                </div>
                <div className="border rounded-lg overflow-hidden h-[70vh] bg-muted">
                    <iframe src={url} className="w-full h-full" title={fileName} />
                </div>
            </div>
        );
    }

    // For images, use zoomable viewer
    return (
        <div className="space-y-2">
            {/* Fullscreen button */}
            <div className="flex justify-end">
                <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                            <Maximize2 className="h-4 w-4 mr-2" />
                            Tela cheia
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] w-full max-h-[95vh] p-6">
                        <DialogHeader>
                            <DialogTitle className="flex items-center justify-between">
                                <span>{fileName}</span>
                            </DialogTitle>
                        </DialogHeader>
                        <ZoomableImage url={url} fileName={fileName} isFullscreen />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Inline zoomable viewer */}
            <ZoomableImage url={url} fileName={fileName} />
        </div>
    );
}


interface AdjustmentListProps {
    request: PatientRequest;
    pacienteDoc: PacienteDocument;
    pacienteDocs?: PacienteDocument[];
    comprovanteResidenciaDoc: ComprovanteResidenciaDocument;
    comprovanteResidenciaDocs?: ComprovanteResidenciaDocument[];
    procuracaoDoc: ProcuracaoDocument | null;
    procuracaoDocs?: ProcuracaoDocument[];
    receitaMedicaDoc: ReceitaMedicaDocument;
    receitaMedicaDocs?: ReceitaMedicaDocument[];
    isProcessing?: boolean;
    reusedData?: Partial<OcrData>;
}

export function AdjustmentList({ request, pacienteDoc, pacienteDocs = [], comprovanteResidenciaDoc, comprovanteResidenciaDocs = [], procuracaoDoc, procuracaoDocs = [], receitaMedicaDoc, receitaMedicaDocs = [], isProcessing, reusedData }: AdjustmentListProps) {
  const isAutomationComplete = request.status === 'CONCLUIDO';
  const showForm = !isAutomationComplete; // Show form for any non-complete status

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
            <AutomationHelper
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
            />


            {showForm && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="font-headline text-2xl">
                                Dados Extraídos
                            </CardTitle>
                            <CardDescription>
                                Revise e corrija os dados. Use os botões de copiar para preenchimento manual.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CorrectionSuggestions
                                pacienteDoc={pacienteDoc}
                                pacienteDocs={pacienteDocs}
                                comprovanteResidenciaDoc={comprovanteResidenciaDoc}
                                comprovanteResidenciaDocs={comprovanteResidenciaDocs}
                                procuracaoDoc={procuracaoDoc}
                                procuracaoDocs={procuracaoDocs}
                                receitaMedicaDoc={receitaMedicaDoc}
                                receitaMedicaDocs={receitaMedicaDocs}
                                isProcessing={isProcessing}
                            />
                        </CardContent>
                    </Card>
                    <OcrDataForm
                        request={request}
                        pacienteDoc={pacienteDoc}
                        pacienteDocs={pacienteDocs}
                        comprovanteResidenciaDoc={comprovanteResidenciaDoc}
                        comprovanteResidenciaDocs={comprovanteResidenciaDocs}
                        procuracaoDoc={procuracaoDoc}
                        procuracaoDocs={procuracaoDocs}
                        receitaMedicaDoc={receitaMedicaDoc}
                        receitaMedicaDocs={receitaMedicaDocs}
                        reusedData={reusedData}
                    />
                </>
            )}

            {isAutomationComplete && (
                <Alert variant="default" className="bg-green-50 border-green-200 text-green-900">
                    <CheckCircle className="h-4 w-4 !text-green-600"/>
                    <AlertTitle>Automação Concluída!</AlertTitle>
                    <AlertDescription>
                        O processo foi finalizado com sucesso. <br/>
                        Número de confirmação ANVISA: <strong>{request.confirmationNumber || 'N/A'}</strong>
                    </AlertDescription>
                </Alert>
            )}
        </div>
        <div className="lg:sticky top-24 self-start space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Documentos Originais</CardTitle>
                    <CardDescription>Use os documentos abaixo para verificar os dados extraídos.</CardDescription>
                </CardHeader>
                <CardContent>
                    {(() => {
                        // Build tab entries for all document types, supporting multiple pages per type
                        const tabEntries: { value: string; label: string; doc: { fileStoragePath: string; fileName: string } }[] = [];

                        // Paciente docs
                        const pDocs = pacienteDocs.length > 0 ? pacienteDocs : [pacienteDoc];
                        pDocs.forEach((d, i) => {
                            tabEntries.push({
                                value: pDocs.length === 1 ? 'paciente' : `paciente-${i}`,
                                label: pDocs.length === 1 ? 'Paciente' : `Paciente ${i + 1}`,
                                doc: d,
                            });
                        });

                        // Comprovante docs
                        const crDocs = comprovanteResidenciaDocs.length > 0 ? comprovanteResidenciaDocs : [comprovanteResidenciaDoc];
                        crDocs.forEach((d, i) => {
                            tabEntries.push({
                                value: crDocs.length === 1 ? 'comprovante' : `comprovante-${i}`,
                                label: crDocs.length === 1 ? 'Residência' : `Residência ${i + 1}`,
                                doc: d,
                            });
                        });

                        // Procuracao docs (optional)
                        procuracaoDocs.forEach((d, i) => {
                            tabEntries.push({
                                value: `procuracao-${i}`,
                                label: procuracaoDocs.length === 1 ? 'Adicional' : `Adicional ${i + 1}`,
                                doc: d,
                            });
                        });

                        // Receita docs
                        const rDocs = receitaMedicaDocs.length > 0 ? receitaMedicaDocs : [receitaMedicaDoc];
                        rDocs.forEach((d, i) => {
                            tabEntries.push({
                                value: rDocs.length === 1 ? 'receita' : `receita-${i}`,
                                label: rDocs.length === 1 ? 'Receita' : `Receita ${i + 1}`,
                                doc: d,
                            });
                        });

                        return (
                            <Tabs defaultValue={tabEntries[0]?.value}>
                                <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${tabEntries.length}, minmax(0, 1fr))` }}>
                                    {tabEntries.map(entry => (
                                        <TabsTrigger key={entry.value} value={entry.value} className="text-xs">
                                            {entry.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                {tabEntries.map(entry => (
                                    <TabsContent key={entry.value} value={entry.value} className="mt-4">
                                        <DocumentViewer filePath={entry.doc.fileStoragePath} fileName={entry.doc.fileName} />
                                    </TabsContent>
                                ))}
                            </Tabs>
                        );
                    })()}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
