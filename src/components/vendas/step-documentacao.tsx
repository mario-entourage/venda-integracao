'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { useCollection } from '@/firebase';
import { getOrderSubcollectionRef, getOrderRef, updateOrder } from '@/services/orders.service';
import { getClientRef } from '@/services/clients.service';
import { getDoctorRef } from '@/services/doctors.service';
import { updateDocumentRequestStatus } from '@/services/documents.service';
import { updateClient } from '@/services/clients.service';
import { updateDoctor } from '@/services/doctors.service';
import { generateProcuracao } from '@/server/actions/zapsign.actions';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { UpdateProfileDialog, type FieldChange } from './update-profile-dialog';
import { cn } from '@/lib/utils';
import type { Client, Doctor, Order } from '@/types';
import type { ClassifyAndExtractResponse } from '@/app/api/ai/classify-and-extract-document/route';

// ─── label maps ──────────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
  identity: 'Documento de Identidade (RG / CNH)',
  proof_of_address: 'Comprovante de Residência',
  prescription: 'Receita Médica',
  anvisa_authorization: 'Autorização ANVISA',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function diff(current: string | undefined | null, extracted: string | null): string | null {
  if (!extracted) return null;
  const c = (current ?? '').trim().toLowerCase();
  const e = extracted.trim().toLowerCase();
  if (c === e || e === '') return null;
  return extracted; // return the new value
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

interface PendingUpdate {
  entityType: 'client' | 'doctor';
  entityId: string;
  entityLabel: string;
  changes: FieldChange[];
  fieldsToApply: Record<string, unknown>;
}

interface StepDocumentacaoProps {
  orderId: string;
  anvisaOption: string;
  clientId: string;
  clientName: string;
  doctorId: string;
  clientIsNew: boolean;
  doctorIsNew: boolean;
}

export function StepDocumentacao({
  orderId, anvisaOption, clientId, clientName, doctorId, clientIsNew, doctorIsNew,
}: StepDocumentacaoProps) {
  const { firestore, storage, user } = useFirebase();

  // Load doc requests
  const docRequestsRef = useMemoFirebase(
    () => firestore && orderId ? getOrderSubcollectionRef(firestore, orderId, 'documentRequests') : null,
    [firestore, orderId],
  );
  const { data: docRequests, isLoading } = useCollection<DocRequest>(docRequestsRef);

  // Load client + doctor records for comparison
  const clientRef = useMemoFirebase(
    () => firestore && clientId ? getClientRef(firestore, clientId) : null,
    [firestore, clientId],
  );
  const doctorRef = useMemoFirebase(
    () => firestore && doctorId ? getDoctorRef(firestore, doctorId) : null,
    [firestore, doctorId],
  );
  const { data: clientData } = useDoc<Client>(clientRef);
  const { data: doctorData } = useDoc<Doctor>(doctorRef);

  // Subscribe to order for ZapSign fields
  const orderDocRef = useMemoFirebase(
    () => firestore && orderId ? getOrderRef(firestore, orderId) : null,
    [firestore, orderId],
  );
  const { data: orderData } = useDoc<Order>(orderDocRef);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);

  // ZapSign state
  const hasTriggeredZapSign = useRef(false);
  const [zapsignLoading, setZapsignLoading] = useState(false);
  const [zapsignError, setZapsignError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const requests = docRequests ?? [];
  const receivedCount = requests.filter((r) => r.status === 'received' || r.status === 'approved').length;
  const totalCount = requests.length;
  const allReceived = totalCount > 0 && receivedCount === totalCount;

  // ── auto-trigger ZapSign procuração ───────────────────────────────────────
  useEffect(() => {
    if (
      !allReceived ||
      anvisaOption === 'exempt' ||
      !orderId ||
      !firestore ||
      orderData?.zapsignDocId ||
      hasTriggeredZapSign.current ||
      !clientData?.address ||
      !clientData?.document
    ) return;

    hasTriggeredZapSign.current = true;

    const trigger = async () => {
      setZapsignLoading(true);
      setZapsignError(null);
      try {
        const addr = clientData.address!;
        const result = await generateProcuracao(
          orderId,
          clientData.fullName,
          clientData.document,
          clientData.email || undefined,
          clientData.phone || undefined,
          {
            street: addr.street,
            number: addr.number,
            complement: addr.complement,
            neighborhood: addr.neighborhood,
            city: addr.city,
            state: addr.state,
            postalCode: addr.postalCode,
          },
        );

        if (result.error || !result.signUrl) {
          throw new Error(result.error || 'Link de assinatura não retornado.');
        }

        await updateOrder(firestore, orderId, {
          zapsignDocId: result.docId,
          zapsignStatus: result.status,
          zapsignSignUrl: result.signUrl,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao gerar procuração.';
        setZapsignError(msg);
        hasTriggeredZapSign.current = false; // allow retry
      } finally {
        setZapsignLoading(false);
      }
    };

    trigger();
  }, [allReceived, anvisaOption, orderId, firestore, orderData?.zapsignDocId, clientData]);

  // ── process uploaded document ─────────────────────────────────────────────
  const processDocument = useCallback(async (file: File) => {
    if (!firestore || !storage || !user) {
      setProcessingMsg('Serviços indisponíveis. Recarregue a página e tente novamente.');
      return;
    }
    setIsProcessing(true);
    setProcessingMsg('Enviando documento…');

    try {
      // 1. Upload to Storage — non-fatal, same as step 1.
      // If CORS or network blocks the upload, we still run the AI
      // classification and update the document request status.
      try {
        const path = `documents/${orderId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const storageRef = ref(storage, path);
        const task = uploadBytesResumable(storageRef, file);
        const uploadPromise = new Promise<void>((resolve, reject) => {
          task.on('state_changed', null, reject, resolve);
        });
        const uploadTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => {
            task.cancel();
            reject(new Error('Upload timed out'));
          }, 20_000),
        );
        await Promise.race([uploadPromise, uploadTimeout]);
      } catch (uploadErr) {
        console.warn('[step3] Storage upload failed (continuing with AI):', uploadErr);
      }

      setProcessingMsg('Classificando documento com IA…');

      // 2. Call AI classify + extract
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/ai/classify-and-extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' }),
      });
      const classification: ClassifyAndExtractResponse = await res.json();

      // 3. Mark matching document request as received
      const matchingRequest = requests.find(
        (r) => r.documentType === classification.documentType && r.status === 'pending',
      );
      if (matchingRequest) {
        await updateDocumentRequestStatus(firestore, orderId, matchingRequest.id, 'received');
        setProcessingMsg(`Documento "${DOC_LABELS[classification.documentType] ?? classification.documentType}" registrado ✓`);
      } else {
        setProcessingMsg(`Documento classificado como "${DOC_LABELS[classification.documentType] ?? classification.documentType}".`);
      }

      // 4. Build profile update diffs
      const ex = classification.extractedData;

      if (classification.documentType === 'identity' && clientData) {
        const changes: FieldChange[] = [];
        const fieldsToApply: Record<string, unknown> = {};

        const addChange = (key: string, label: string, current: string | undefined | null, newVal: string | null) => {
          const v = diff(current, newVal);
          if (!v) return;
          changes.push({ key, label, currentValue: current ?? '', newValue: v, wasEmpty: !current });
          fieldsToApply[key] = v;
        };

        addChange('rg', 'RG', clientData.rg, ex.rg);
        addChange('document', 'CPF', clientData.document, ex.cpf);

        if (ex.fullName) {
          const nameParts = ex.fullName.trim().split(' ');
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(' ') || '';
          if (diff(clientData.firstName, firstName)) {
            changes.push({ key: 'firstName', label: 'Nome', currentValue: clientData.firstName, newValue: firstName, wasEmpty: false });
            fieldsToApply['firstName'] = firstName;
            fieldsToApply['fullName'] = ex.fullName;
          }
          if (diff(clientData.lastName, lastName)) {
            changes.push({ key: 'lastName', label: 'Sobrenome', currentValue: clientData.lastName ?? '', newValue: lastName, wasEmpty: !clientData.lastName });
            fieldsToApply['lastName'] = lastName;
            fieldsToApply['fullName'] = ex.fullName;
          }
        }

        if (ex.birthDate && !clientData.birthDate) {
          changes.push({ key: 'birthDate', label: 'Data de Nascimento', currentValue: '', newValue: ex.birthDate, wasEmpty: true });
          fieldsToApply['birthDateStr'] = ex.birthDate;
        }

        if (changes.length > 0) {
          if (clientIsNew) {
            await updateClient(firestore, clientId, fieldsToApply as Parameters<typeof updateClient>[2]);
          } else {
            setPendingUpdate({ entityType: 'client', entityId: clientId, entityLabel: `Paciente: ${clientName}`, changes, fieldsToApply });
          }
        }
      }

      if (classification.documentType === 'proof_of_address' && clientData) {
        const changes: FieldChange[] = [];
        const addressFields: Record<string, string> = {};

        const addAddrChange = (key: string, label: string, current: string | undefined, newVal: string | null) => {
          const v = diff(current, newVal);
          if (!v) return;
          changes.push({ key, label, currentValue: current ?? '', newValue: v, wasEmpty: !current });
          addressFields[key] = v;
        };

        addAddrChange('postalCode', 'CEP', clientData.address?.postalCode, ex.postalCode);
        addAddrChange('street', 'Logradouro', clientData.address?.street, ex.street);
        addAddrChange('number', 'Número', clientData.address?.number, ex.streetNumber);
        addAddrChange('complement', 'Complemento', clientData.address?.complement, ex.complement);
        addAddrChange('neighborhood', 'Bairro', clientData.address?.neighborhood, ex.neighborhood);
        addAddrChange('city', 'Cidade', clientData.address?.city, ex.city);
        addAddrChange('state', 'Estado', clientData.address?.state, ex.state);

        if (changes.length > 0) {
          const newAddress = { ...(clientData.address ?? { street: '', number: '', neighborhood: '', city: '', state: '', country: 'BR', postalCode: '' }), ...addressFields };
          if (clientIsNew) {
            await updateClient(firestore, clientId, { address: newAddress } as Parameters<typeof updateClient>[2]);
          } else {
            setPendingUpdate({
              entityType: 'client', entityId: clientId, entityLabel: `Paciente: ${clientName}`,
              changes,
              fieldsToApply: { address: newAddress },
            });
          }
        }
      }

      if ((classification.documentType === 'prescription' || classification.documentType === 'anvisa_authorization') && doctorData) {
        const changes: FieldChange[] = [];
        const fieldsToApply: Record<string, unknown> = {};

        const addDrChange = (key: string, label: string, current: string | undefined | null, newVal: string | null) => {
          const v = diff(current, newVal);
          if (!v) return;
          changes.push({ key, label, currentValue: current ?? '', newValue: v, wasEmpty: !current });
          fieldsToApply[key] = v;
        };

        addDrChange('crm', 'CRM', doctorData.crm, ex.doctorCrm);
        addDrChange('mainSpecialty', 'Especialidade', doctorData.mainSpecialty, ex.doctorSpecialty);
        addDrChange('state', 'UF', doctorData.state, ex.doctorState);
        addDrChange('city', 'Município', doctorData.city, ex.doctorCity);
        addDrChange('phone', 'Telefone Fixo', doctorData.phone, ex.doctorPhone);
        addDrChange('mobilePhone', 'Celular', doctorData.mobilePhone, ex.doctorMobilePhone);
        addDrChange('email', 'E-mail', doctorData.email, ex.doctorEmail);

        if (changes.length > 0) {
          if (doctorIsNew) {
            await updateDoctor(firestore, doctorId, fieldsToApply as Parameters<typeof updateDoctor>[2]);
          } else {
            setPendingUpdate({ entityType: 'doctor', entityId: doctorId, entityLabel: `Médico: ${doctorData.fullName}`, changes, fieldsToApply });
          }
        }
      }

    } catch (err) {
      console.error('Document processing error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setProcessingMsg(`Erro: ${errMsg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [firestore, storage, user, orderId, requests, clientData, doctorData, clientId, doctorId, clientIsNew, doctorIsNew, clientName]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      await processDocument(file);
    }
  }, [processDocument]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    // no maxFiles limit — multiple files can be dropped or selected at once
    disabled: isProcessing,
  });

  const handleApplyUpdate = async (selectedKeys: string[]) => {
    if (!pendingUpdate || !firestore) return;
    const fieldsToSave: Record<string, unknown> = {};
    for (const key of selectedKeys) {
      // For address updates, the whole address object is stored under 'address'
      if (pendingUpdate.fieldsToApply['address'] !== undefined) {
        fieldsToSave['address'] = pendingUpdate.fieldsToApply['address'];
        break;
      }
      if (key in pendingUpdate.fieldsToApply) fieldsToSave[key] = pendingUpdate.fieldsToApply[key];
    }
    if (pendingUpdate.entityType === 'client') {
      await updateClient(firestore, pendingUpdate.entityId, fieldsToSave as Parameters<typeof updateClient>[2]);
    } else {
      await updateDoctor(firestore, pendingUpdate.entityId, fieldsToSave as Parameters<typeof updateDoctor>[2]);
    }
    setPendingUpdate(null);
  };

  const fmtDate = (ts: { seconds: number } | undefined) =>
    ts ? new Date(ts.seconds * 1000).toLocaleDateString('pt-BR') : null;

  return (
    <div className="space-y-6">
      {/* Update profile dialog */}
      {pendingUpdate && (
        <UpdateProfileDialog
          open={true}
          onClose={() => setPendingUpdate(null)}
          onApply={handleApplyUpdate}
          entityLabel={pendingUpdate.entityLabel}
          changes={pendingUpdate.changes}
        />
      )}

      {/* Header */}
      <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
        <p className="text-sm font-medium">
          {clientName} · Pedido <span className="font-mono text-xs">{orderId.slice(0, 8).toUpperCase()}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {receivedCount} de {totalCount} documentos recebidos
        </p>
        {totalCount > 0 && (
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', allReceived ? 'bg-green-500' : 'bg-primary')}
              style={{ width: `${(receivedCount / totalCount) * 100}%` }} />
          </div>
        )}
      </div>

      {/* Single upload drop zone */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Enviar Documento</p>
        <div
          {...getRootProps()}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all cursor-pointer',
            isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40',
            isProcessing && 'pointer-events-none opacity-60',
          )}
        >
          <input {...getInputProps()} />
          {isProcessing ? (
            <>
              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm font-medium text-primary">{processingMsg ?? 'Processando…'}</p>
            </>
          ) : (
            <>
              <svg className="mb-3 h-9 w-9 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-semibold">Arrastar ou clicar para enviar</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Vários arquivos aceitos · A IA identifica o tipo automaticamente · PDF, JPG, PNG
              </p>
            </>
          )}
        </div>
        {processingMsg && !isProcessing && (
          <p className={cn('text-xs flex items-center gap-1', processingMsg.includes('✓') ? 'text-green-600' : 'text-muted-foreground')}>
            {processingMsg.includes('✓') ? '✓' : 'ℹ'} {processingMsg}
          </p>
        )}
      </div>

      {/* Document checklist */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento solicitado.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const isReceived = req.status === 'received' || req.status === 'approved';
            return (
              <div key={req.id} className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', isReceived ? 'border-green-200 bg-green-50' : 'border-border')}>
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', isReceived ? 'bg-green-100' : 'bg-amber-100')}>
                  {isReceived ? (
                    <svg className="h-4 w-4 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{DOC_LABELS[req.documentType] ?? req.documentType}</p>
                  {isReceived && req.receivedAt && (
                    <p className="text-xs text-muted-foreground">Recebido em {fmtDate(req.receivedAt)}</p>
                  )}
                </div>
                <Badge variant="outline" className={cn('text-xs shrink-0', isReceived ? 'border-green-300 text-green-700 bg-green-50' : 'border-amber-300 text-amber-700 bg-amber-50')}>
                  {isReceived ? 'Recebido' : 'Em falta'}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* ZapSign procuração */}
      {anvisaOption !== 'exempt' && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Procuração ANVISA ({anvisaOption === 'exceptional' ? 'Excepcional' : 'Regular'})</p>

          {/* State: signing link ready */}
          {orderData?.zapsignSignUrl ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <p className="text-sm font-medium text-green-700">Procuração gerada</p>
                <Badge variant="outline" className="ml-auto border-green-300 text-green-700 bg-green-50 text-xs">
                  {orderData.zapsignStatus === 'signed' ? 'Assinada' : 'Pendente'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={orderData.zapsignSignUrl}
                  className="h-8 text-xs bg-white"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8"
                  onClick={() => {
                    navigator.clipboard.writeText(orderData.zapsignSignUrl!);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                >
                  {copiedLink ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  asChild
                >
                  <a href={orderData.zapsignSignUrl} target="_blank" rel="noopener noreferrer">
                    Abrir link de assinatura
                  </a>
                </Button>
                {clientData?.phone && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    asChild
                  >
                    <a
                      href={`https://wa.me/${clientData.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${clientData.firstName ?? clientData.fullName}, segue o link para assinar a procuração ANVISA:\n${orderData.zapsignSignUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Enviar via WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ) : zapsignLoading ? (
            /* State: generating */
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent shrink-0" />
                <p className="text-sm text-blue-700">Gerando procuração no ZapSign…</p>
              </div>
            </div>
          ) : zapsignError ? (
            /* State: error */
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-2">
              <p className="text-sm text-red-700">{zapsignError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => {
                  hasTriggeredZapSign.current = false;
                  setZapsignError(null);
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : allReceived && !clientData?.address ? (
            /* State: missing address */
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-amber-700">
                  Endereço do paciente não cadastrado. Envie o comprovante de residência para gerar a procuração automaticamente.
                </p>
              </div>
            </div>
          ) : (
            /* State: waiting for docs */
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <p className="text-sm text-blue-700">
                  A procuração será gerada automaticamente após todos os documentos serem recebidos.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {allReceived && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <svg className="h-5 w-5 text-green-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-sm font-medium text-green-700">Todos os documentos foram recebidos!</p>
        </div>
      )}
    </div>
  );
}
