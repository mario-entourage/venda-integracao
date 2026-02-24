'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrderSubcollectionRef } from '@/services/orders.service';
import { updateDocumentRequestStatus } from '@/services/documents.service';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { cn } from '@/lib/utils';

// ─── label maps ──────────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
  identity: 'Documento de Identidade (RG / CNH)',
  proof_of_address: 'Comprovante de Residência',
  prescription: 'Receita Médica',
  anvisa_authorization: 'Autorização ANVISA',
};

// ─── single doc row ───────────────────────────────────────────────────────────

interface DocRowProps {
  requestId: string;
  orderId: string;
  documentType: string;
  status: string;
  receivedAt?: { seconds: number } | null;
}

function DocRow({ requestId, orderId, documentType, status, receivedAt }: DocRowProps) {
  const { firestore, storage, user } = useFirebase();
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);

  const isReceived = status === 'received' || status === 'approved';

  const onDrop = useCallback(
    (files: File[]) => {
      if (!files[0] || !firestore || !storage || !user) return;
      const file = files[0];
      const storageRef = ref(storage, `documents/${orderId}/${documentType}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);

      setIsUploading(true);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        () => setIsUploading(false),
        async () => {
          try {
            await getDownloadURL(task.snapshot.ref);
            await updateDocumentRequestStatus(firestore, orderId, requestId, 'received');
          } finally {
            setIsUploading(false);
          }
        },
      );
    },
    [firestore, storage, user, orderId, requestId, documentType],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: isUploading || isReceived,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
  });

  const receivedDate = receivedAt
    ? new Date(receivedAt.seconds * 1000).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      {/* Status indicator */}
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isReceived ? 'bg-green-100' : 'bg-amber-100',
        )}
      >
        {isReceived ? (
          <svg
            className="h-4 w-4 text-green-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4 text-amber-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        )}
      </div>

      {/* Label + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{DOC_LABELS[documentType] ?? documentType}</p>
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              isReceived
                ? 'border-green-300 text-green-700 bg-green-50'
                : 'border-amber-300 text-amber-700 bg-amber-50',
            )}
          >
            {isReceived ? 'Recebido' : 'Em falta'}
          </Badge>
        </div>
        {receivedDate && (
          <p className="mt-0.5 text-xs text-muted-foreground">Recebido em {receivedDate}</p>
        )}

        {/* Upload zone */}
        {!isReceived && (
          <div className="mt-3">
            {isUploading ? (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Enviando… {uploadProgress}%</p>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40',
                  isDragActive && 'border-primary bg-primary/5',
                )}
              >
                <input {...getInputProps()} />
                <svg
                  className="h-4 w-4 shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <span className="text-xs">
                  {isDragActive ? 'Solte para enviar' : 'Arrastar ou clicar para enviar'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface DocRequest {
  id: string;
  orderId: string;
  documentType: string;
  status: string;
  requestedAt?: { seconds: number };
  receivedAt?: { seconds: number };
}

interface StepDocumentacaoProps {
  orderId: string;
  anvisaOption: string;
  clientName: string;
}

export function StepDocumentacao({ orderId, anvisaOption, clientName }: StepDocumentacaoProps) {
  const { firestore } = useFirebase();

  const docRequestsRef = useMemoFirebase(
    () =>
      firestore && orderId
        ? getOrderSubcollectionRef(firestore, orderId, 'documentRequests')
        : null,
    [firestore, orderId],
  );

  const { data: docRequests, isLoading } = useCollection<DocRequest>(docRequestsRef);

  const requests = docRequests ?? [];
  const receivedCount = requests.filter(
    (r) => r.status === 'received' || r.status === 'approved',
  ).length;
  const totalCount = requests.length;
  const allReceived = totalCount > 0 && receivedCount === totalCount;

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
        <p className="text-sm font-medium">
          {clientName || 'Paciente'} · Pedido{' '}
          <span className="font-mono text-xs">{orderId.slice(0, 8).toUpperCase()}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {receivedCount} de {totalCount} documentos recebidos
        </p>
        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                allReceived ? 'bg-green-500' : 'bg-primary',
              )}
              style={{ width: `${(receivedCount / totalCount) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Document requests */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma solicitação de documento encontrada.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <DocRow
              key={req.id}
              requestId={req.id}
              orderId={orderId}
              documentType={req.documentType}
              status={req.status}
              receivedAt={req.receivedAt}
            />
          ))}
        </div>
      )}

      {/* ANVISA notice */}
      {anvisaOption !== 'exempt' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-800">
                Procuração ANVISA ({anvisaOption === 'exceptional' ? 'Excepcional' : 'Regular'})
              </p>
              <p className="mt-0.5 text-xs text-blue-600">
                Uma procuração ZapSign será enviada após a finalização do pedido.
              </p>
            </div>
          </div>
        </div>
      )}

      {allReceived && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <svg
            className="h-5 w-5 text-green-600 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-sm font-medium text-green-700">
            Todos os documentos foram recebidos!
          </p>
        </div>
      )}
    </div>
  );
}
