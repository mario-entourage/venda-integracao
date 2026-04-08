'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getDocs, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { useFirebase, useMemoFirebase, useDoc, useCollection } from '@/firebase';
import {
  getOrderRef,
  getOrderSubcollectionRef,
  updateOrderStatus,
  updateOrder,
  updateOrderRepresentative,
} from '@/services/orders.service';
import { getActiveRepUsersQuery } from '@/services/users.service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useToast } from '@/hooks/use-toast';
import { OrderChecklist } from '@/components/controle/order-checklist';
import { FileUpload } from '@/components/shared/file-upload';
import { createDocumentRecord, updateDocumentRecord, getDocumentRecordsByOrderId } from '@/services/documents.service';
import { OrderStatus } from '@/types';
import type { Order, OrderCustomer, OrderDoctor, OrderRepresentative } from '@/types';
import type { User } from '@/types';

// ─── local types ──────────────────────────────────────────────────────────────

type StoredProduct = {
  id: string;
  productName?: string;
  stockProductId?: string;
  quantity: number;
  price: number;
  discount: number;
};

// ─── status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:            { label: 'Pendente',       className: 'border-slate-300 text-slate-600 bg-slate-50' },
  processing:         { label: 'Em andamento',   className: 'border-blue-300 text-blue-700 bg-blue-50' },
  awaiting_documents: { label: 'Aguard. docs',   className: 'border-amber-300 text-amber-700 bg-amber-50' },
  documents_complete: { label: 'Docs OK',        className: 'border-teal-300 text-teal-700 bg-teal-50' },
  awaiting_payment:   { label: 'Aguard. pagto',  className: 'border-orange-300 text-orange-700 bg-orange-50' },
  paid:               { label: 'Pago',           className: 'border-green-300 text-green-700 bg-green-50' },
  shipped:            { label: 'Enviado',        className: 'border-purple-300 text-purple-700 bg-purple-50' },
  delivered:          { label: 'Entregue',       className: 'border-green-400 text-green-800 bg-green-100' },
  cancelled:          { label: 'Cancelado',      className: 'border-red-300 text-red-600 bg-red-50' },
};

const ANVISA_LABELS: Record<string, string> = {
  regular:     'Regular',
  exceptional: 'Especial',
  exempt:      'Isento',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  prescription: 'Prescrição',
  identity: 'Identidade',
  proof_of_address: 'Comprov. Endereço',
  medical_report: 'Laudo Médico',
  invoice: 'Nota Fiscal',
  anvisa_authorization: 'Autorização ANVISA',
  general: 'Geral',
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (ts: unknown) => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleDateString('pt-BR');
};

// ─── component ───────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { firestore, storage, user } = useFirebase();
  const authFetch = useAuthFetch();
  const { toast } = useToast();

  // Real-time order subscription
  const orderRef = useMemoFirebase(
    () => (firestore && orderId ? getOrderRef(firestore, orderId) : null),
    [firestore, orderId],
  );
  const { data: order, isLoading: orderLoading } = useDoc<Order>(orderRef);

  // Rep users (for the representative selector)
  const repUsersQ = useMemoFirebase(
    () => (firestore ? getActiveRepUsersQuery(firestore) : null),
    [firestore],
  );
  const { data: repUsers } = useCollection<User>(repUsersQ);

  // Subcollection data (loaded once on mount)
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [doctor, setDoctor] = useState<OrderDoctor | null>(null);
  const [representative, setRepresentative] = useState<OrderRepresentative | null>(null);
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !orderId) return;
    setSubLoading(true);
    let initialLoad = true;

    const unsubCustomer = onSnapshot(getOrderSubcollectionRef(firestore, orderId, 'customer'), (snap) => {
      setCustomer(snap.docs[0] ? ({ id: snap.docs[0].id, ...snap.docs[0].data() } as unknown as OrderCustomer) : null);
      if (initialLoad) { initialLoad = false; setSubLoading(false); }
    });
    const unsubDoctor = onSnapshot(getOrderSubcollectionRef(firestore, orderId, 'doctor'), (snap) => {
      setDoctor(snap.docs[0] ? ({ id: snap.docs[0].id, ...snap.docs[0].data() } as unknown as OrderDoctor) : null);
    });
    const unsubRep = onSnapshot(getOrderSubcollectionRef(firestore, orderId, 'representative'), (snap) => {
      setRepresentative(snap.docs[0] ? ({ id: snap.docs[0].id, ...snap.docs[0].data() } as unknown as OrderRepresentative) : null);
    });
    const unsubProducts = onSnapshot(getOrderSubcollectionRef(firestore, orderId, 'products'), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StoredProduct, 'id'>) })));
    });

    return () => { unsubCustomer(); unsubDoctor(); unsubRep(); unsubProducts(); };
  }, [firestore, orderId]);

  // ── document uploads ─────────────────────────────────────────────────────────
  const [uploadedDocs, setUploadedDocs] = useState<{ name: string; url: string; type: string; docRecordId: string }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [classifyingFiles, setClassifyingFiles] = useState<Set<string>>(new Set());

  // Pre-load existing document filenames to prevent duplicate uploads
  useEffect(() => {
    if (!firestore || !orderId) return;
    getDocumentRecordsByOrderId(firestore, orderId).then((existing) => {
      setUploadedDocs(existing.map((d) => ({
        name: String((d.metadata as Record<string, unknown>)?.fileName ?? d.key),
        url: String((d.metadata as Record<string, unknown>)?.url ?? ''),
        type: d.type,
        docRecordId: d.id,
      })));
    }).catch(() => { /* non-fatal */ });
  }, [firestore, orderId]);

  /** Convert a File to base64 for AI classification. */
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]); // strip "data:...;base64," prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const MAX_CLASSIFY_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /** Called when a file finishes uploading. Classifies via AI, then creates document record. */
  const handleFileReady = async (file: File, result: { path: string; url: string; name: string }) => {
    if (!firestore) return;

    // Reject duplicate filenames
    if (uploadedDocs.some((d) => d.name === result.name)) {
      toast({
        variant: 'destructive',
        title: 'Documento já enviado',
        description: `"${result.name}" já foi carregado para este pedido.`,
      });
      return;
    }

    let docType = 'general';
    setClassifyingFiles((prev) => new Set(prev).add(file.name));

    try {
      // Skip AI classification for oversized files
      if (file.size > MAX_CLASSIFY_FILE_SIZE) {
        toast({ title: 'Arquivo grande', description: 'Arquivo excede 10MB — selecione o tipo manualmente.' });
      } else {
        // AI classification
        const base64 = await fileToBase64(file);
        const res = await authFetch('/api/ai/classify-document', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' }),
          timeout: 60_000, // AI classification can be slow
        });
        if (res.ok) {
          const data = await res.json();
          if (data.documentType && data.documentType !== 'unknown') {
            docType = data.documentType;
          }
        }
      }
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      toast({
        title: 'Tipo não reconhecido',
        description: isTimeout
          ? 'A classificação demorou muito. Selecione o tipo manualmente.'
          : 'Não foi possível classificar o documento. Selecione o tipo manualmente.',
      });
      // Either way, fall back to 'general'
    } finally {
      setClassifyingFiles((prev) => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
    }

    try {
      const docRecordId = await createDocumentRecord(firestore, {
        type: docType,
        holder: customer?.name ?? '',
        key: result.path,
        number: '',
        metadata: { fileName: result.name, url: result.url, doctorName: doctor?.name ?? '' },
        userId: user?.uid ?? '',
        orderId,
      });
      setUploadedDocs((prev) => [...prev, { name: result.name, url: result.url, type: docType, docRecordId }]);
      setUploadError(null);
    } catch (err) {
      console.error('[OrderDetailPage] doc record error:', err);
      setUploadError('Arquivo enviado mas erro ao salvar registro.');
      // Clean up the orphaned storage file
      if (storage) {
        try {
          await deleteObject(storageRef(storage, result.path));
        } catch (cleanupErr) {
          console.error('[OrderDetailPage] storage cleanup failed:', cleanupErr);
        }
      }
    }
  };

  /** Override the AI-detected document type for an already-uploaded doc. */
  const handleTypeOverride = async (idx: number, newType: string) => {
    const doc = uploadedDocs[idx];
    if (!firestore || !doc) return;
    const prevType = doc.type;
    setUploadedDocs((prev) => prev.map((d, i) => (i === idx ? { ...d, type: newType } : d)));
    try {
      await updateDocumentRecord(firestore, doc.docRecordId, { type: newType });
    } catch (err) {
      console.error('[OrderDetailPage] type override error:', err);
      setUploadedDocs((prev) => prev.map((d, i) => (i === idx ? { ...d, type: prevType } : d)));
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar tipo',
        description: 'Não foi possível salvar o tipo do documento. Tente novamente.',
      });
    }
  };

  // ── GlobalPay payment sync ───────────────────────────────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handlePaymentSync = async () => {
    setIsSyncing(true);
    setSyncMsg(null);
    try {
      const res = await authFetch('/api/payments/sync', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
      const data = await res.json() as { checked?: number; approved?: number; errors?: number };
      setSyncMsg(
        data.approved
          ? `✓ Pagamento confirmado!`
          : `${data.checked ?? 0} link(s) verificado(s) — nenhum pagamento novo.`,
      );
    } catch {
      setSyncMsg('Não foi possível sincronizar o pagamento. Verifique sua conexão e tente novamente.');
    } finally {
      setIsSyncing(false);
    }
  };

  // ── representative change ───────────────────────────────────────────────────
  const [repSaving, setRepSaving] = useState(false);

  const handleRepChange = async (userId: string) => {
    if (!firestore) return;
    const isNone = userId === '__none__';
    const repUser = isNone ? null : (repUsers ?? []).find((r) => r.id === userId);
    const name = repUser?.displayName || repUser?.email || 'Venda Direta';

    setRepSaving(true);
    try {
      await updateOrderRepresentative(firestore, orderId, {
        name: isNone ? 'Venda Direta' : name,
        userId: isNone ? '' : userId,
      }, user!.uid);
      setRepresentative((prev) =>
        prev
          ? { ...prev, name: isNone ? 'Venda Direta' : name, userId: isNone ? '' : userId }
          : null,
      );
    } catch (err) {
      console.error('[OrderDetailPage] rep update error:', err);
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar representante',
        description: 'Não foi possível alterar o representante. Tente novamente.',
      });
    } finally {
      setRepSaving(false);
    }
  };

  // ── manual status override ───────────────────────────────────────────────────
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleMarkAsPaid = async () => {
    if (!firestore || !user) return;
    setIsUpdating(true);
    setUpdateError(null);
    try {
      await updateOrderStatus(firestore, orderId, 'paid', user.uid);
    } catch (err) {
      console.error('[OrderDetailPage] mark paid error:', err);
      setUpdateError('Não foi possível marcar como pago. Verifique sua conexão e tente novamente.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkAsSigned = async (field: 'zapsignStatus' | 'zapsignCvStatus') => {
    if (!firestore || !user) return;
    setIsUpdating(true);
    setUpdateError(null);
    try {
      await updateOrder(firestore, orderId, {
        [field]: 'signed',
        updatedById: user.uid,
      }, user.uid);
    } catch (err) {
      console.error('[OrderDetailPage] mark signed error:', err);
      setUpdateError('Não foi possível atualizar o status de assinatura. Verifique sua conexão e tente novamente.');
    } finally {
      setIsUpdating(false);
    }
  };

  // ── cancel logic ────────────────────────────────────────────────────────────
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = async () => {
    if (!firestore || !user) return;
    setIsCancelling(true);
    try {
      await updateOrderStatus(firestore, orderId, 'cancelled', user.uid);
      // Navigate after success — skip setState since component will unmount
      router.push('/controle');
    } catch (err) {
      console.error('[OrderDetailPage] cancel error:', err);
      setConfirmCancel(false);
      toast({
        variant: 'destructive',
        title: 'Erro ao cancelar pedido',
        description: 'Não foi possível cancelar o pedido. Verifique sua conexão e tente novamente.',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // ── loading skeleton ────────────────────────────────────────────────────────
  if (orderLoading || subLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="h-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-40 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/controle')}>
          ← Voltar
        </Button>
        <p className="text-muted-foreground">Pedido não encontrado.</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const isPending = order.status === 'pending';

  // Can manually advance to "Pago" — any status before paid / final states
  const canMarkAsPaid = ![
    OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED,
  ].includes(order.status as OrderStatus);
  const isCancelledOrder = order.status === OrderStatus.CANCELLED;
  // Per-doc-type signing flags
  const canMarkProcuracaoSigned = !isCancelledOrder && !!order.zapsignDocId && order.zapsignStatus !== 'signed';
  const canMarkCvSigned = !isCancelledOrder && !!order.zapsignCvDocId && order.zapsignCvStatus !== 'signed';
  // Show the manual status section at all
  const showPaymentActions = canMarkAsPaid || canMarkProcuracaoSigned || canMarkCvSigned;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/controle')}
          className="-ml-2"
        >
          ← Voltar
        </Button>
        <h1 className="font-headline text-2xl font-bold">
          Pedido #{orderId.slice(0, 8).toUpperCase()}
        </h1>
        <Badge variant="outline" className={cn('ml-auto', statusCfg.className)}>
          {statusCfg.label}
        </Badge>
      </div>

      {/* ── Metadata ── */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes do Pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Paciente</dt>
              <dd className="mt-0.5 font-medium">{customer?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">CPF do Paciente</dt>
              <dd className="mt-0.5 font-medium">{customer?.document || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Médico / Prescritor</dt>
              <dd className="mt-0.5 font-medium">{doctor?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">CRM / CRO</dt>
              <dd className="mt-0.5 font-medium">{doctor?.crm ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ANVISA</dt>
              <dd className="mt-0.5 font-medium">
                {ANVISA_LABELS[order.anvisaOption ?? ''] ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Data do Pedido</dt>
              <dd className="mt-0.5 font-medium">{fmtDate(order.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Validade da Receita</dt>
              <dd className="mt-0.5 font-medium">
                {(() => {
                  const rxDate = order.prescriptionDate;
                  if (!rxDate) return '—';
                  const d = new Date(rxDate + 'T12:00:00');
                  if (isNaN(d.getTime())) return '—';
                  const expiry = new Date(d);
                  expiry.setMonth(expiry.getMonth() + 6);
                  const now = new Date();
                  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  const isExpired = daysLeft <= 0;
                  const isNearExpiry = daysLeft > 0 && daysLeft <= 30;
                  return (
                    <span className={cn(isExpired ? 'text-red-600 font-semibold' : isNearExpiry ? 'text-amber-600 font-semibold' : '')}>
                      {expiry.toLocaleDateString('pt-BR')}
                      {isExpired && ' (vencida)'}
                      {isNearExpiry && ` (${daysLeft}d restantes)`}
                    </span>
                  );
                })()}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-muted-foreground mb-1">Representante</dt>
              <dd>
                <Select
                  value={representative?.userId || '__none__'}
                  onValueChange={handleRepChange}
                  disabled={repSaving || isCancelledOrder || !repUsers}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Selecionar representante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum (Venda Direta)</SelectItem>
                    {(repUsers ?? []).map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.displayName || rep.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {repSaving && (
                  <p className="text-xs text-muted-foreground mt-1">Salvando…</p>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* ── Order Checklist ── */}
      <OrderChecklist order={order} />

      {/* ── Document Upload ── */}
      {!isCancelledOrder && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enviar Documentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Envie documentos — o tipo será detectado automaticamente.
            </p>
            <FileUpload
              storagePath={`documents/${orderId}`}
              onUploadComplete={() => {}}
              onFileReady={handleFileReady}
              onError={(err) => setUploadError(err.message)}
              multiple
              label="Clique ou arraste arquivos aqui"
              sublabel="Aceita múltiplos arquivos · PDF, JPG, PNG (max 5MB cada)"
            />
            {classifyingFiles.size > 0 && (
              <p className="text-xs text-muted-foreground animate-pulse">
                Classificando {classifyingFiles.size} documento{classifyingFiles.size > 1 ? 's' : ''}...
              </p>
            )}
            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}
            {uploadedDocs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Enviados nesta sessão:</p>
                {uploadedDocs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="truncate text-green-700">{d.name}</span>
                    <Select value={d.type} onValueChange={(v) => handleTypeOverride(i, v)}>
                      <SelectTrigger className="h-6 w-auto min-w-[120px] text-xs px-2 py-0 gap-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Products ── */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {products.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              Nenhum produto registrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 pl-6 text-left font-medium text-muted-foreground">
                      Produto
                    </th>
                    <th className="pb-2 text-center font-medium text-muted-foreground w-16">
                      Qtd
                    </th>
                    <th className="pb-2 text-right font-medium text-muted-foreground w-32">
                      Preço Unit.
                    </th>
                    <th className="pb-2 pr-6 text-right font-medium text-muted-foreground w-32">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const unitPrice = p.price * (1 - (p.discount || 0) / 100);
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2.5 pl-6">
                          {p.productName ?? p.stockProductId ?? '—'}
                        </td>
                        <td className="py-2.5 text-center">{p.quantity}</td>
                        <td className="py-2.5 text-right">{fmtBRL(unitPrice)}</td>
                        <td className="py-2.5 pr-6 text-right">
                          {fmtBRL(unitPrice * p.quantity)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {order.frete && order.frete > 0 && (
                    <>
                      <tr className="border-t">
                        <td colSpan={3} className="pt-3 pl-6 pb-0.5 text-right text-sm text-muted-foreground">
                          Subtotal
                        </td>
                        <td className="pt-3 pr-6 pb-0.5 text-right text-sm">
                          {fmtBRL(order.amount)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="pl-6 pb-0.5 text-right text-sm text-muted-foreground">
                          Frete
                        </td>
                        <td className="pr-6 pb-0.5 text-right text-sm">
                          {fmtBRL(order.frete)}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr className={!order.frete ? 'border-t' : ''}>
                    <td
                      colSpan={3}
                      className="pt-1 pl-6 pb-1 text-right font-semibold text-muted-foreground"
                    >
                      Total
                    </td>
                    <td className="pt-1 pr-6 pb-1 text-right text-lg font-bold">
                      {fmtBRL(order.amount + (order.frete || 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── GlobalPay payment sync ── */}
      {canMarkAsPaid && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sincronizar Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Consulta o GlobalPay e atualiza o status do link de pagamento pendente.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={isSyncing}
                onClick={handlePaymentSync}
              >
                {isSyncing ? 'Sincronizando…' : '↻ Sincronizar GlobalPay'}
              </Button>
              {syncMsg && (
                <p className="text-sm text-muted-foreground">{syncMsg}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Manual payment status override ── */}
      {showPaymentActions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atualizar Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Marque manualmente o status de pagamento ou contrato deste pedido.
            </p>
            <div className="flex flex-wrap gap-3">
              {canMarkAsPaid && (
                <Button
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-50"
                  disabled={isUpdating}
                  onClick={handleMarkAsPaid}
                >
                  {isUpdating ? 'Atualizando…' : '✓ Marcar como Pago'}
                </Button>
              )}
              {canMarkProcuracaoSigned && (
                <Button
                  variant="outline"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  disabled={isUpdating}
                  onClick={() => handleMarkAsSigned('zapsignStatus')}
                >
                  {isUpdating ? 'Atualizando…' : '✍ Procuracao Assinada'}
                </Button>
              )}
              {canMarkCvSigned && (
                <Button
                  variant="outline"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  disabled={isUpdating}
                  onClick={() => handleMarkAsSigned('zapsignCvStatus')}
                >
                  {isUpdating ? 'Atualizando…' : '✍ Comprovante Assinado'}
                </Button>
              )}
            </div>
            {updateError && (
              <p className="text-sm text-destructive">{updateError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Actions (pending only) ── */}
      {isPending && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Cancel with inline confirm */}
          {confirmCancel ? (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-sm text-red-700">Confirmar cancelamento?</p>
              <Button
                size="sm"
                variant="destructive"
                disabled={isCancelling}
                onClick={handleCancel}
              >
                {isCancelling ? 'Cancelando…' : 'Sim, cancelar'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isCancelling}
                onClick={() => setConfirmCancel(false)}
              >
                Não
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setConfirmCancel(true)}
            >
              Cancelar Venda
            </Button>
          )}

          {/* Resume wizard */}
          <Button onClick={() => router.push(`/remessas?resume=${orderId}`)}>
            Continuar Venda →
          </Button>
        </div>
      )}
    </div>
  );
}
