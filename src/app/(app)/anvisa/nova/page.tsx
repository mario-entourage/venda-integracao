'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Upload, Zap, X, Check, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { fileToDataUrl } from '@/lib/anvisa-file-utils';
import type { AnvisaDocumentType, AnvisaRequestStatus } from '@/types/anvisa';
import type { ClassifyDocumentOutput } from '@/ai/flows/anvisa/classify-document';
import { ANVISA_ROUTES, ANVISA_API_ROUTES } from '@/lib/anvisa-routes';
import { ANVISA_COLLECTIONS, ANVISA_SUBCOLLECTIONS } from '@/lib/anvisa-paths';

// ============================================================================
// Types
// ============================================================================

type ClassificationType = 'DOCUMENTO_PACIENTE' | 'COMPROVANTE_RESIDENCIA' | 'RECEITA_MEDICA' | 'OUTRO';

type ClassifiedFile = {
  file: File;
  classifiedType: ClassificationType | null;
  confidence: number;
  reasoning: string;
  isClassifying: boolean;
  userOverride?: ClassificationType;
};

const DOC_TYPE_LABELS: Record<ClassificationType, string> = {
  DOCUMENTO_PACIENTE: 'Documento do Paciente',
  COMPROVANTE_RESIDENCIA: 'Comprovante de Residencia',
  RECEITA_MEDICA: 'Receita Medica',
  OUTRO: 'Outro',
};

const REQUIRED_TYPES: ClassificationType[] = ['DOCUMENTO_PACIENTE', 'COMPROVANTE_RESIDENCIA', 'RECEITA_MEDICA'];

// ============================================================================
// File Validation
// ============================================================================

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif',
  '.tif', '.tiff', '.bmp', '.webp', '.heic', '.heif',
]);

const FILE_SIZE_WARN_MB = 10;
const FILE_SIZE_LIMIT_MB = 20;
const FILE_SIZE_WARN_BYTES = FILE_SIZE_WARN_MB * 1024 * 1024;
const FILE_SIZE_LIMIT_BYTES = FILE_SIZE_LIMIT_MB * 1024 * 1024;

/** Accepts a file if its MIME type OR extension matches the allowed list. */
function isAcceptedFile(file: File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return ALLOWED_EXTENSIONS.has(ext);
}

const EXTENSION_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

/** Returns the effective MIME type for a file, falling back to extension-based lookup. */
function effectiveMimeType(file: File): string {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return EXTENSION_TO_MIME[ext] || 'application/octet-stream';
}

type FileFilterResult = {
  accepted: File[];
  rejectedType: string[];
  rejectedSize: string[];
  warned: string[];
};

/** Validates files for type and size. Returns accepted, rejected, and warned file lists. */
function filterFiles(files: File[]): FileFilterResult {
  const accepted: File[] = [];
  const rejectedType: string[] = [];
  const rejectedSize: string[] = [];
  const warned: string[] = [];

  for (const f of files) {
    if (!isAcceptedFile(f)) {
      rejectedType.push(f.name);
      continue;
    }
    if (f.size > FILE_SIZE_LIMIT_BYTES) {
      rejectedSize.push(f.name);
      continue;
    }
    if (f.size > FILE_SIZE_WARN_BYTES) {
      warned.push(f.name);
    }
    accepted.push(f);
  }

  return { accepted, rejectedType, rejectedSize, warned };
}

// ============================================================================
// Filename-based Classification Heuristic
// ============================================================================

type FilenameClassification = {
  type: ClassificationType;
  confidence: number;
  reasoning: string;
} | null;

function classifyByFilename(fileName: string): FilenameClassification {
  const name = fileName.toLowerCase().replace(/[_\-\.]/g, ' ').replace(/\s+/g, ' ').trim();

  if (/^receita\b/.test(name)) {
    return {
      type: 'RECEITA_MEDICA',
      confidence: 0.9,
      reasoning: 'Nome do arquivo comeca com "receita", indicando receita medica.',
    };
  }

  const idKeywords = [
    'rg', 'identidade', 'carteira de identidade', 'registro geral',
    'cnh', 'habilitacao', 'habilitacao', 'carteira motorista',
    'passaporte', 'passport',
    'documento paciente', 'doc paciente', 'documento do paciente',
    'cpf', 'id card',
  ];
  for (const kw of idKeywords) {
    if (name.includes(kw)) {
      return {
        type: 'DOCUMENTO_PACIENTE',
        confidence: 0.85,
        reasoning: `Nome do arquivo contem "${kw}", indicando documento de identidade.`,
      };
    }
  }

  const residenciaKeywords = [
    'comprovante', 'comp resid',
    'residencia', 'residencia', 'endereco', 'endereco',
    'conta de luz', 'conta de agua', 'conta de agua', 'conta de gas', 'conta de gas',
    'conta energia', 'conta agua', 'conta agua', 'fatura',
    'iptu', 'cemig', 'copasa', 'copel', 'enel', 'sabesp', 'light',
    'proof of address', 'utility bill',
  ];
  for (const kw of residenciaKeywords) {
    if (name.includes(kw)) {
      return {
        type: 'COMPROVANTE_RESIDENCIA',
        confidence: 0.85,
        reasoning: `Nome do arquivo contem "${kw}", indicando comprovante de residencia.`,
      };
    }
  }

  const receitaKeywords = [
    'receita', 'prescricao', 'prescricao', 'prescription',
    'receita medica', 'receita medica', 'receituario', 'receituario',
    'medicamento', 'laudo', 'laudo medico', 'laudo medico',
    'crm', 'medical',
  ];
  for (const kw of receitaKeywords) {
    if (name.includes(kw)) {
      return {
        type: 'RECEITA_MEDICA',
        confidence: 0.85,
        reasoning: `Nome do arquivo contem "${kw}", indicando receita medica.`,
      };
    }
  }

  return null;
}

// ============================================================================
// Helper Components
// ============================================================================

function FileUploadButton({
  onFileSelect,
  onReject,
  onSizeReject,
  onSizeWarn,
  multiple = false,
  label,
}: {
  onFileSelect: (files: File[]) => void;
  onReject?: (rejectedNames: string[]) => void;
  onSizeReject?: (rejectedNames: string[]) => void;
  onSizeWarn?: (warnedNames: string[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const processFiles = (files: File[]) => {
    const result = filterFiles(files);
    if (result.rejectedType.length > 0 && onReject) {
      onReject(result.rejectedType);
    }
    if (result.rejectedSize.length > 0 && onSizeReject) {
      onSizeReject(result.rejectedSize);
    }
    if (result.warned.length > 0 && onSizeWarn) {
      onSizeWarn(result.warned);
    }
    return result.accepted;
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const accepted = processFiles(Array.from(e.dataTransfer.files));
      if (accepted.length > 0) {
        onFileSelect(multiple ? accepted : [accepted[0]]);
      }
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.tif,.tiff,.bmp,.webp,.heic,.heif"
        className="hidden"
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) {
            const accepted = processFiles(Array.from(e.target.files));
            if (accepted.length > 0) {
              onFileSelect(accepted);
            }
          }
          // Reset so the same file can be re-selected
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <div
        role="button"
        tabIndex={0}
        className={`w-full h-20 border-dashed border-2 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary hover:bg-primary/5'
        }`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Upload className="mr-2 h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {isDragging
            ? 'Solte os arquivos aqui'
            : label || (multiple ? 'Escolher arquivo(s)' : 'Escolher arquivo')}
        </span>
      </div>
    </>
  );
}

function RequiredTypesStatus({ classifiedFiles }: { classifiedFiles: ClassifiedFile[] }) {
  const coveredTypes = new Set(
    classifiedFiles
      .map(f => f.userOverride || f.classifiedType)
      .filter((t): t is ClassificationType => t !== null && t !== 'OUTRO')
  );

  return (
    <div className="flex flex-wrap gap-2">
      {REQUIRED_TYPES.map(type => {
        const covered = coveredTypes.has(type);
        return (
          <div
            key={type}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              covered
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-muted/50 border-border text-muted-foreground'
            }`}
          >
            {covered ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {DOC_TYPE_LABELS[type]}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Classified Upload Area
// ============================================================================

function ClassifiedUploadArea({
  classifiedFiles,
  onFilesAdd,
  onFileRemove,
  onTypeOverride,
  onReject,
  onSizeReject,
  onSizeWarn,
}: {
  classifiedFiles: ClassifiedFile[];
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (index: number) => void;
  onTypeOverride: (index: number, type: ClassificationType) => void;
  onReject?: (rejectedNames: string[]) => void;
  onSizeReject?: (rejectedNames: string[]) => void;
  onSizeWarn?: (warnedNames: string[]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-full">
            <FileUp className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle>Documentos Obrigatorios</CardTitle>
            <RequiredTypesStatus classifiedFiles={classifiedFiles} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* File list */}
        {classifiedFiles.length > 0 && (
          <div className="space-y-2">
            {classifiedFiles.map((entry, index) => {
              const effectiveType = entry.userOverride || entry.classifiedType;
              const needsManualSelect = !entry.isClassifying && !effectiveType;

              return (
                <div
                  key={`${entry.file.name}-${index}`}
                  className={`flex items-center gap-3 p-3 border rounded-lg ${
                    needsManualSelect ? 'bg-red-50 border-red-300' :
                    entry.isClassifying ? 'bg-muted/30 border-border' :
                    'bg-muted/50 border-border'
                  }`}
                >
                  <FileUp className="h-5 w-5 text-primary shrink-0" />
                  <p className="text-sm text-foreground flex-1 truncate min-w-0">{entry.file.name}</p>

                  {/* Classification status */}
                  {entry.isClassifying ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Classificando...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={effectiveType || ''}
                        onValueChange={(val) => onTypeOverride(index, val as ClassificationType)}
                      >
                        <SelectTrigger className="w-[220px] h-8 text-xs">
                          <SelectValue placeholder="Selecione o tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOCUMENTO_PACIENTE">{DOC_TYPE_LABELS.DOCUMENTO_PACIENTE}</SelectItem>
                          <SelectItem value="COMPROVANTE_RESIDENCIA">{DOC_TYPE_LABELS.COMPROVANTE_RESIDENCIA}</SelectItem>
                          <SelectItem value="RECEITA_MEDICA">{DOC_TYPE_LABELS.RECEITA_MEDICA}</SelectItem>
                          <SelectItem value="OUTRO">{DOC_TYPE_LABELS.OUTRO}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => onFileRemove(index)}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Upload button */}
        <FileUploadButton
          onFileSelect={onFilesAdd}
          onReject={onReject}
          onSizeReject={onSizeReject}
          onSizeWarn={onSizeWarn}
          multiple
          label="Clique ou arraste os documentos obrigatorios. Pode enviar varias paginas do mesmo documento."
        />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Multi Upload Card (for optional docs)
// ============================================================================

function MultiUploadCard({
  icon,
  title,
  description,
  onFileAdd,
  onFileRemove,
  onReject,
  onSizeReject,
  onSizeWarn,
  selectedFiles,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onFileAdd: (files: File[]) => void;
  onFileRemove: (index: number) => void;
  onReject?: (rejectedNames: string[]) => void;
  onSizeReject?: (rejectedNames: string[]) => void;
  onSizeWarn?: (warnedNames: string[]) => void;
  selectedFiles: File[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="bg-secondary p-3 rounded-full">{icon}</div>
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid w-full items-center gap-1.5">
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-lg">
                  <FileUp className="h-5 w-5 text-primary shrink-0" />
                  <p className="text-sm text-foreground flex-1 truncate">{file.name}</p>
                  <Button variant="ghost" size="sm" type="button" className="h-7 w-7 p-0" onClick={() => onFileRemove(index)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <FileUploadButton onFileSelect={onFileAdd} onReject={onReject} onSizeReject={onSizeReject} onSizeWarn={onSizeWarn} multiple />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function NewRequestPage() {
  const [classifiedFiles, setClassifiedFiles] = useState<ClassifiedFile[]>([]);
  const [outrosFiles, setOutrosFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { firestore, storage, user } = useFirebase();
  const { toast } = useToast();

  // Prevent browser from opening files when dropped outside the drop zones
  useEffect(() => {
    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);
    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

  // Derived state
  const isAnyClassifying = classifiedFiles.some(f => f.isClassifying);
  const coveredTypes = new Set(
    classifiedFiles
      .map(f => f.userOverride || f.classifiedType)
      .filter((t): t is ClassificationType => t !== null && t !== 'OUTRO')
  );
  const allRequiredCovered = REQUIRED_TYPES.every(t => coveredTypes.has(t));

  const canSubmit = allRequiredCovered && !isAnyClassifying && !isLoading;

  // Show toast when unsupported files are rejected
  const handleFileReject = (rejectedNames: string[]) => {
    toast({
      variant: 'destructive',
      title: 'Arquivo(s) nao suportado(s)',
      description: `Apenas imagens e PDFs sao aceitos. Ignorado(s): ${rejectedNames.join(', ')}`,
    });
  };

  const handleSizeReject = (rejectedNames: string[]) => {
    toast({
      variant: 'destructive',
      title: 'Arquivo(s) muito grande(s)',
      description: `O limite e ${FILE_SIZE_LIMIT_MB}MB por arquivo. Rejeitado(s): ${rejectedNames.join(', ')}`,
    });
  };

  const handleSizeWarn = (warnedNames: string[]) => {
    toast({
      title: 'Arquivo(s) grande(s)',
      description: `${warnedNames.join(', ')} — acima de ${FILE_SIZE_WARN_MB}MB. O upload pode demorar mais.`,
    });
  };

  // --------------------------------
  // Handlers for classified files
  // --------------------------------

  const handleRequiredFilesAdd = async (files: File[]) => {
    // First pass: try to classify by filename (instant, no API call)
    const filenameResults = files.map(file => classifyByFilename(file.name));

    // Add entries — files with a filename match are immediately classified
    const newEntries: ClassifiedFile[] = files.map((file, i) => {
      const fnResult = filenameResults[i];
      if (fnResult) {
        return {
          file,
          classifiedType: fnResult.type,
          confidence: fnResult.confidence,
          reasoning: fnResult.reasoning,
          isClassifying: false,
        };
      }
      return {
        file,
        classifiedType: null,
        confidence: 0,
        reasoning: '',
        isClassifying: true,
      };
    });

    setClassifiedFiles(prev => [...prev, ...newEntries]);

    // Second pass: for files that weren't classified by filename, call the AI API
    const filesToClassify = files.filter((_, i) => !filenameResults[i]);

    if (filesToClassify.length === 0) return;

    await Promise.allSettled(
      filesToClassify.map(async (file) => {
        try {
          const dataUrl = await fileToDataUrl(file);
          const response = await fetch(ANVISA_API_ROUTES.classifyDocument, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileDataUrl: dataUrl,
              contentType: effectiveMimeType(file),
              fileName: file.name,
            }),
          });

          if (!response.ok) throw new Error('Classification failed');

          const result: ClassifyDocumentOutput = await response.json();

          setClassifiedFiles(prev =>
            prev.map(entry =>
              entry.file === file
                ? {
                    ...entry,
                    classifiedType: result.documentType as ClassificationType,
                    confidence: result.confidence,
                    reasoning: result.reasoning,
                    isClassifying: false,
                  }
                : entry
            )
          );
        } catch (error) {
          console.error('Classification failed for', file.name, error);
          setClassifiedFiles(prev =>
            prev.map(entry =>
              entry.file === file
                ? { ...entry, isClassifying: false }
                : entry
            )
          );
        }
      })
    );
  };

  const handleRequiredFileRemove = (index: number) => {
    setClassifiedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleTypeOverride = (index: number, type: ClassificationType) => {
    setClassifiedFiles(prev =>
      prev.map((entry, i) =>
        i === index ? { ...entry, userOverride: type } : entry
      )
    );
  };

  // --------------------------------
  // Handlers for optional files
  // --------------------------------

  const handleOutrosFileAdd = (files: File[]) => {
    setOutrosFiles(prev => [...prev, ...files]);
  };

  const handleOutrosFileRemove = (index: number) => {
    setOutrosFiles(prev => prev.filter((_, i) => i !== index));
  };

  // --------------------------------
  // Submit
  // --------------------------------

  const handleProcessDocuments = async (initialStatus: AnvisaRequestStatus = 'PENDENTE') => {
    // Build type -> files map from classified files (supports multiple files per type)
    const typeFilesMap = new Map<AnvisaDocumentType, File[]>();
    for (const entry of classifiedFiles) {
      const effectiveType = entry.userOverride || entry.classifiedType;
      if (effectiveType && effectiveType !== 'OUTRO') {
        const appType = effectiveType as AnvisaDocumentType;
        const existing = typeFilesMap.get(appType) || [];
        existing.push(entry.file);
        typeFilesMap.set(appType, existing);
      }
    }

    // Validate all required types are present
    const missingTypes = REQUIRED_TYPES.filter(t => !typeFilesMap.has(t as AnvisaDocumentType));
    if (missingTypes.length > 0) {
      const missingLabels = missingTypes.map(t => DOC_TYPE_LABELS[t]).join(', ');
      toast({
        variant: 'destructive',
        title: 'Documentos faltando',
        description: `Faltam os seguintes documentos: ${missingLabels}`,
      });
      return;
    }

    if (!user) {
      toast({ variant: 'destructive', title: 'Erro de Autenticacao', description: 'Voce precisa estar logado para criar uma solicitacao.' });
      return;
    }

    setIsLoading(true);

    try {
      const newRequestId = doc(collection(firestore, 'id_generator')).id;

      // ---------------------------------------------------------------
      // PHASE 1: Prepare all Firestore document data (no uploads yet)
      // ---------------------------------------------------------------

      const docIds: {
        pacienteDocumentId: string;
        pacienteDocumentIds: string[];
        comprovanteResidenciaDocumentId: string;
        comprovanteResidenciaDocumentIds: string[];
        procuracaoDocumentId: string;
        procuracaoDocumentIds: string[];
        receitaMedicaDocumentId: string;
        receitaMedicaDocumentIds: string[];
      } = {
        pacienteDocumentId: '',
        pacienteDocumentIds: [],
        comprovanteResidenciaDocumentId: '',
        comprovanteResidenciaDocumentIds: [],
        procuracaoDocumentId: '',
        procuracaoDocumentIds: [],
        receitaMedicaDocumentId: '',
        receitaMedicaDocumentIds: [],
      };

      // Collect all subdocument data and their associated files for later upload
      type SubdocEntry = {
        docId: string;
        subcollectionPath: string;
        fileName: string;
        storagePath: string;
        file: File;
      };
      const subdocEntries: SubdocEntry[] = [];

      // Prepare required docs
      for (const [docType, files] of typeFilesMap.entries()) {
        let subcollectionPath: string;
        let idKey: 'pacienteDocumentId' | 'comprovanteResidenciaDocumentId' | 'receitaMedicaDocumentId';
        let idsKey: 'pacienteDocumentIds' | 'comprovanteResidenciaDocumentIds' | 'receitaMedicaDocumentIds';

        switch (docType) {
          case 'DOCUMENTO_PACIENTE':
            subcollectionPath = ANVISA_SUBCOLLECTIONS.pacienteDocuments;
            idKey = 'pacienteDocumentId';
            idsKey = 'pacienteDocumentIds';
            break;
          case 'COMPROVANTE_RESIDENCIA':
            subcollectionPath = ANVISA_SUBCOLLECTIONS.comprovanteResidenciaDocuments;
            idKey = 'comprovanteResidenciaDocumentId';
            idsKey = 'comprovanteResidenciaDocumentIds';
            break;
          case 'RECEITA_MEDICA':
            subcollectionPath = ANVISA_SUBCOLLECTIONS.receitaMedicaDocuments;
            idKey = 'receitaMedicaDocumentId';
            idsKey = 'receitaMedicaDocumentIds';
            break;
          default:
            continue;
        }

        for (const file of files) {
          const docId = doc(collection(firestore, 'id_generator')).id;
          const storagePath = `${ANVISA_COLLECTIONS.requests}/${newRequestId}/${docType}/${file.name}`;
          docIds[idsKey].push(docId);
          if (!docIds[idKey]) {
            docIds[idKey] = docId;
          }
          subdocEntries.push({ docId, subcollectionPath, fileName: file.name, storagePath, file });
        }
      }

      // Prepare "outros" documents
      for (const file of outrosFiles) {
        const docId = doc(collection(firestore, 'id_generator')).id;
        const storagePath = `${ANVISA_COLLECTIONS.requests}/${newRequestId}/PROCURACAO/${file.name}`;
        docIds.procuracaoDocumentIds.push(docId);
        if (!docIds.procuracaoDocumentId) {
          docIds.procuracaoDocumentId = docId;
        }
        subdocEntries.push({ docId, subcollectionPath: ANVISA_SUBCOLLECTIONS.procuracaoDocuments, fileName: file.name, storagePath, file });
      }

      // ---------------------------------------------------------------
      // PHASE 2: Create parent request + all subdocuments in Firestore
      // ---------------------------------------------------------------

      const requestRef = doc(firestore, ANVISA_COLLECTIONS.requests, newRequestId);
      const now = new Date().toISOString();

      const { writeBatch: createBatch } = await import('firebase/firestore');
      const parentBatch = createBatch(firestore);
      parentBatch.set(requestRef, {
        id: newRequestId,
        patientDisplayName: '(Identificando...)',
        status: initialStatus,
        ownerEmail: user.email!,
        createdAt: now,
        updatedAt: now,
        currentStep: 'Upload',
        softDeleted: false,
        confirmationNumber: null,
        pacienteDocumentId: docIds.pacienteDocumentId,
        pacienteDocumentIds: docIds.pacienteDocumentIds,
        comprovanteResidenciaDocumentId: docIds.comprovanteResidenciaDocumentId,
        comprovanteResidenciaDocumentIds: docIds.comprovanteResidenciaDocumentIds,
        procuracaoDocumentId: docIds.procuracaoDocumentId,
        procuracaoDocumentIds: docIds.procuracaoDocumentIds,
        receitaMedicaDocumentId: docIds.receitaMedicaDocumentId,
        receitaMedicaDocumentIds: docIds.receitaMedicaDocumentIds,
      });
      await parentBatch.commit();

      // Now create all subdocuments
      const subdocBatch = writeBatch(firestore);
      for (const entry of subdocEntries) {
        const docRef = doc(firestore, `${ANVISA_COLLECTIONS.requests}/${newRequestId}/${entry.subcollectionPath}`, entry.docId);
        subdocBatch.set(docRef, {
          id: entry.docId,
          fileName: entry.fileName,
          fileStoragePath: entry.storagePath,
          ocrTextChunks: [],
          extractedFields: '{}',
          missingCriticalFields: [],
          fieldConfidence: '{}',
        });
      }
      await subdocBatch.commit();

      // ---------------------------------------------------------------
      // PHASE 3: Upload files to Storage
      // ---------------------------------------------------------------

      await Promise.all(
        subdocEntries.map(async (entry) => {
          const storageRef = ref(storage, entry.storagePath);
          await uploadBytes(storageRef, entry.file);
        })
      );

      toast({
        title: 'Sucesso!',
        description: initialStatus === 'EM_AUTOMACAO'
          ? 'Solicitacao criada! Redirecionando para o preenchimento ANVISA...'
          : 'Sua solicitacao foi criada e os documentos foram enviados.',
      });

      router.push(ANVISA_ROUTES.requestDetail(newRequestId));
    } catch (error: any) {
      console.error('Error creating request: ', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao criar solicitacao',
        description: error.message || 'Ocorreu um problema ao processar sua solicitacao. Tente novamente.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Criar Nova Solicitacao</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ClassifiedUploadArea
            classifiedFiles={classifiedFiles}
            onFilesAdd={handleRequiredFilesAdd}
            onFileRemove={handleRequiredFileRemove}
            onTypeOverride={handleTypeOverride}
            onReject={handleFileReject}
            onSizeReject={handleSizeReject}
            onSizeWarn={handleSizeWarn}
          />
          <MultiUploadCard
            icon={<FileUp className="h-6 w-6 text-muted-foreground" />}
            title="Outros Documentos (Opcional)"
            description=""
            onFileAdd={handleOutrosFileAdd}
            onFileRemove={handleOutrosFileRemove}
            onReject={handleFileReject}
            onSizeReject={handleSizeReject}
            onSizeWarn={handleSizeWarn}
            selectedFiles={outrosFiles}
          />
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Link href={ANVISA_ROUTES.dashboard} passHref>
            <Button variant="outline" disabled={isLoading}>Cancelar</Button>
          </Link>
          <Button
            onClick={() => handleProcessDocuments('EM_AUTOMACAO')}
            disabled={!canSubmit}
            title="Reconhece o texto dos documentos"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            Reconhecer
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
