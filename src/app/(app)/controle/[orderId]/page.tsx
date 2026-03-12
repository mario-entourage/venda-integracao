'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getDocs } from 'firebase/firestore';
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
import { OrderChecklist } from '@/components/controle/order-checklist';
import { FileUpload } from '@/components/shared/file-upload';
import { createDocumentRecord } from '@/services/documents.service';
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
  const { firestore, user } = useFirebase();

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
    Promise.all([
      getDocs(getOrderSubcollectionRef(firestore, orderId, 'customer')),
      getDocs(getOrderSubcollectionRef(firestore, orderId, 'doctor')),
      getDocs(getOrderSubcollectionRef(firestore, orderId, 'representative')),
      getDocs(getOrderSubcollectionRef(firestore, orderId, 'products')),
    ])
      .then(([customerSnap, doctorSnap, repSnap, productsSnap]) => {
        setCustomer(
          customerSnap.docs[0]
            ? ({ id: customerSnap.docs[0].id, ...customerSnap.docs[0].data() } as unknown as OrderCustomer)
            : null,
        );
        setDoctor(
          doctorSnap.docs[0]
            ? ({ id: doctorSnap.docs[0].id, ...doctorSnap.docs[0].data() } as unknown as OrderDoctor)
            : null,
        );
        setRepresentative(
          repSnap.docs[0]
            ? ({ id: repSnap.docs[0].id, ...repSnap.docs[0].data() } as unknown as OrderRepresentative)
            : null,
        );
        setProducts(
          productsSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<StoredProduct, 'id'>),
          })),
        );
        setSubLoading(false);
      })
      .catch((err) => {
        console.error('[OrderDetailPage] subcollection load error:', err);
        setSubLoading(false);
      });
  }, [firestore, orderId]);

  // ── document uploads ─────────────────────────────────────────────────────────
  const DOC_TYPE_OPTIONS = [
    { value: 'prescription',         label: 'Receita / Prescrição' },
    { value: 'identity',             label: 'Identidade (RG / CNH)' },
    { value: 'medical_report',       label: 'Laudo Médico' },
    { value: 'proof_of_address',     label: 'Comprovante de Endereço' },
    { value: 'invoice',              label: 'Nota Fiscal' },
    { value: 'anvisa_authorization', label: 'Autorização ANVISA' },
    { value: 'general',              label: 'Outro / Geral' },
  ] as const;

  const [selectedDocType, setSelectedDocType] = useState<string>('prescription');
  const [uploadedDocs, setUploadedDocs] = useState<{ name: string; url: string }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDocumentUploaded = async (result: { path: string; url: string; name: string }) => {
    if (!firestore) return;
    try {
      await createDocumentRecord(firestore, {
        type: selectedDocType,
        holder: customer?.name ?? '',
        key: result.path,
        number: '',
        metadata: { fileName: result.name, url: result.url, doctorName: doctor?.name ?? '' },
        userId: user?.uid ?? '',
        orderId,
      });
      setUploadedDocs((prev) => [...prev, { name: result.name, url: result.url }]);
      setUploadError(null);
    } catch (err) {
      console.error('[OrderDetailPage] doc record error:', err);
      setUploadError('Arquivo enviado mas erro ao salvar registro.');
    }
  };

  // ── GlobalPay payment sync ───────────────────────────────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handlePaymentSync = async () => {
    setIsSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/payments/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json() as { checked?: number; approved?: number; errors?: number };
      setSyncMsg(
        data.approved
          ? `✓ Pagamento confirmado!`
          : `${data.checked ?? 0} link(s) verificado(s) — nenhum pagamento novo.`,
      );
    } catch {
      setSyncMsg('Erro ao sincronizar. Tente novamente.');
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
      });
      setRepresentative((prev) =>
        prev
          ? { ...prev, name: isNone ? 'Venda Direta' : name, userId: isNone ? '' : userId }
          : null,
      );
    } catch (err) {
      console.error('[OrderDetailPage] rep update error:', err);
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
      setUpdateError('Erro ao atualizar status.');
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
      });
    } catch (err) {
      console.error('[OrderDetailPage] mark signed error:', err);
      setUpdateError('Erro ao atualizar status.');
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
      router.push('/remessas');
    } catch (err) {
      console.error('[OrderDetailPage] cancel error:', err);
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
        <Button variant="ghost" size="sm" onClick={() => router.push('/remessas')}>
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
          onClick={() => router.push('/remessas')}
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
                  disabled={repSaving || isCancelledOrder}
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
              Selecione o tipo e envie documentos para este pedido.
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                Tipo:
              </label>
              <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FileUpload
              storagePath={`documents/${orderId}`}
              onUploadComplete={handleDocumentUploaded}
              onError={(err) => setUploadError(err.message)}
            />
            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}
            {uploadedDocs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Enviados nesta sessão:</p>
                {uploadedDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-green-700">
                    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {doc.name}
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
                  <tr className="border-t">
                    <td
                      colSpan={3}
                      className="pt-3 pl-6 pb-1 text-right font-semibold text-muted-foreground"
                    >
                      Total
                    </td>
                    <td className="pt-3 pr-6 pb-1 text-right text-lg font-bold">
                      {fmtBRL(order.amount)}
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
