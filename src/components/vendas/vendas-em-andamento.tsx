'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2,
  Loader2,
  MoreHorizontal,
  DollarSign,
  FileText,
  Shield,
  PenTool,
  FileCheck,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { writeBatch } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import {
  getOrdersQuery,
  getOrderRef,
  getOrderSubcollectionDocs,
  updateOrder,
  updateOrderStatus,
} from '@/services/orders.service';
import { generatePaymentLink } from '@/server/actions/payment.actions';
import { createPaymentLink } from '@/services/payments.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getGranularStatus, EXTENDED_STATUS_CONFIG, IN_PROGRESS_STATUSES } from '@/lib/order-status-helpers';
import { OrderStatus, AnvisaOption } from '@/types/enums';
import type { Order, OrderCustomer } from '@/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (ts: { seconds: number } | undefined) => {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR');
};

// ─── missing-item indicator config ─────────────────────────────────────────────

const MISSING_ITEM_CONFIG: Record<string, { icon: React.ElementType; abbr: string; className: string }> = {
  Pagamento:               { icon: DollarSign, abbr: 'Pgto',  className: 'border-orange-300 text-orange-700 bg-orange-50' },
  Documentos:              { icon: FileText,   abbr: 'Docs',  className: 'border-amber-300 text-amber-700 bg-amber-50' },
  ANVISA:                  { icon: Shield,     abbr: 'ANV',   className: 'border-purple-300 text-purple-700 bg-purple-50' },
  'ANVISA (em andamento)': { icon: Shield,     abbr: 'ANV…',  className: 'border-purple-200 text-purple-500 bg-purple-50' },
  'Procuracao (assinatura)': { icon: PenTool,  abbr: 'Proc',  className: 'border-blue-300 text-blue-700 bg-blue-50' },
  Comprovante:             { icon: FileCheck,  abbr: 'CV',    className: 'border-blue-300 text-blue-700 bg-blue-50' },
};

// ─── base status labels (short, one-line) ─────────────────────────────────────

const BASE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  awaiting_documents: 'Aguard. docs',
  documents_complete: 'Docs OK',
  awaiting_payment: 'Aguard. pgto',
  paid: 'Pago',
};

// ─── VendaRow ─────────────────────────────────────────────────────────────────

interface VendaRowProps {
  order: Order;
  isAdmin: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDeleteRequest: () => void;
  onCancelRequest: () => void;
}

function VendaRow({
  order,
  isAdmin,
  isSelected,
  onToggleSelect,
  onDeleteRequest,
  onCancelRequest,
}: VendaRowProps) {
  const { firestore, user } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  // ── load customer ───────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    getOrderSubcollectionDocs<OrderCustomer>(firestore, order.id, 'customer')
      .then((docs) => { if (!cancelled) setCustomer(docs[0] ?? null); })
      .catch((err) => console.error('[VendaRow] customer load:', err))
      .finally(() => { if (!cancelled) setLoadingSub(false); });
    return () => { cancelled = true; };
  }, [firestore, order.id]);

  // ── inline action states ────────────────────────────────────────────────
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRegeneratingLink, setIsRegeneratingLink] = useState(false);

  // ── granular status ─────────────────────────────────────────────────────
  const granular = getGranularStatus(order);
  const baseLabel = BASE_STATUS_LABELS[order.status] ?? order.status;
  const statusCfg = EXTENDED_STATUS_CONFIG[order.status] ?? EXTENDED_STATUS_CONFIG.pending;

  // ── conditional flags ───────────────────────────────────────────────────
  const notPaid = ![OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(
    order.status as OrderStatus,
  );
  const needsAnvisa =
    !!order.anvisaOption && order.anvisaOption !== AnvisaOption.EXEMPT;
  const anvisaConcluded =
    order.anvisaStatus === 'CONCLUIDO' || order.anvisaStatus === 'concluido';
  const showAnvisa = needsAnvisa && !anvisaConcluded;
  const canMarkProcSigned = !!order.zapsignDocId && order.zapsignStatus !== 'signed';
  const canMarkCvSigned = !!order.zapsignCvDocId && order.zapsignCvStatus !== 'signed';

  // ── inline actions ──────────────────────────────────────────────────────
  const handleMarkPaid = async () => {
    if (!firestore || !user) return;
    setIsUpdating(true);
    try {
      await updateOrderStatus(firestore, order.id, 'paid', user.uid);
      toast({ title: 'Pedido marcado como pago.' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao marcar como pago.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkSigned = async (field: 'zapsignStatus' | 'zapsignCvStatus') => {
    if (!firestore || !user) return;
    setIsUpdating(true);
    try {
      await updateOrder(firestore, order.id, {
        [field]: 'signed',
        updatedById: user.uid,
      });
      toast({ title: field === 'zapsignStatus' ? 'Procuração marcada.' : 'Comprovante marcado.' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao atualizar assinatura.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRegeneratePaymentLink = async () => {
    if (!firestore) return;
    setIsRegeneratingLink(true);
    try {
      const result = await generatePaymentLink(
        order.id,
        order.amount,
        order.currency || 'USD',
        customer?.name || undefined,
        undefined,
        undefined,
        customer?.document || undefined,
      );
      if (result.error || !result.paymentUrl) {
        throw new Error(result.error || 'Link não retornado.');
      }
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      await createPaymentLink(firestore, order.id, {
        amount: order.amount,
        currency: order.currency || 'USD',
        referenceId: result.gpOrderId,
        paymentUrl: result.paymentUrl,
        provider: 'globalpay',
        expiresAt,
      });
      try {
        await navigator.clipboard.writeText(result.paymentUrl);
        toast({ title: 'Link regenerado e copiado.' });
      } catch {
        toast({ title: 'Link regenerado com sucesso.' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao regenerar link.';
      toast({ variant: 'destructive', title: 'Erro', description: msg });
    } finally {
      setIsRegeneratingLink(false);
    }
  };

  // ── loading state ───────────────────────────────────────────────────────
  if (loadingSub) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32 flex-1" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors sm:gap-3 sm:px-4 sm:py-3',
        isSelected && 'bg-muted/50',
      )}
    >
      {/* Admin checkbox */}
      {isAdmin && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          aria-label={`Selecionar pedido ${order.id.slice(0, 8)}`}
          className="flex-shrink-0"
        />
      )}

      {/* Clickable area → navigate to detail */}
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-w-0 sm:gap-3"
        onClick={() => router.push(`/controle/${order.id}`)}
      >
        {/* ID + date */}
        <div className="flex-shrink-0 w-[4.5rem]">
          <p className="text-xs font-mono text-muted-foreground">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {fmtDate(order.createdAt as unknown as { seconds: number })}
          </p>
        </div>

        {/* Customer name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{customer?.name ?? '—'}</p>
        </div>

        {/* Base status badge */}
        <Badge
          variant="outline"
          className={cn('text-[10px] flex-shrink-0 whitespace-nowrap', statusCfg.className)}
        >
          {baseLabel}
        </Badge>

        {/* Missing-item indicator pills */}
        {granular.missing.length > 0 && (
          <div className="hidden sm:flex gap-1 flex-shrink-0 flex-wrap">
            {granular.missing.map((item) => {
              const cfg = MISSING_ITEM_CONFIG[item];
              if (!cfg) return null;
              const Icon = cfg.icon;
              return (
                <Tooltip key={item}>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                        cfg.className,
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {cfg.abbr}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {item}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Amount */}
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-semibold">{fmtBRL(order.amount)}</p>
        </div>
      </button>

      {/* Inline action buttons */}
      <div className="flex gap-1 flex-shrink-0">
        {notPaid && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-green-600 hover:bg-green-50"
                disabled={isUpdating}
                onClick={handleMarkPaid}
              >
                <DollarSign className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Marcar como Pago</TooltipContent>
          </Tooltip>
        )}
        {!order.documentsComplete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-amber-600 hover:bg-amber-50"
                onClick={() => router.push(`/controle/${order.id}`)}
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Documentos</TooltipContent>
          </Tooltip>
        )}
        {showAnvisa && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-purple-600 hover:bg-purple-50"
                onClick={() =>
                  router.push(
                    order.anvisaRequestId
                      ? `/anvisa/${order.anvisaRequestId}`
                      : `/anvisa/nova?orderId=${order.id}`,
                  )
                }
              >
                <Shield className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {order.anvisaRequestId ? 'Ver ANVISA' : 'Criar ANVISA'}
            </TooltipContent>
          </Tooltip>
        )}
        {canMarkProcSigned && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                disabled={isUpdating}
                onClick={() => handleMarkSigned('zapsignStatus')}
              >
                <PenTool className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Marcar Procuração</TooltipContent>
          </Tooltip>
        )}
        {canMarkCvSigned && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                disabled={isUpdating}
                onClick={() => handleMarkSigned('zapsignCvStatus')}
              >
                <FileCheck className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Marcar Comprovante</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Hamburger menu (all users) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 flex-shrink-0"
            aria-label="Ações do pedido"
            disabled={isRegeneratingLink}
          >
            {isRegeneratingLink ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push(`/controle/${order.id}`)}>
            Ver detalhes
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleRegeneratePaymentLink}
            disabled={isRegeneratingLink}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerar link de pagamento
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onCancelRequest}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Cancelar pedido
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeleteRequest}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface VendasEmAndamentoProps {
  onNewVenda: () => void;
}

export function VendasEmAndamento({ onNewVenda }: VendasEmAndamentoProps) {
  const router = useRouter();
  const { firestore, user, isAdmin } = useFirebase();
  const { toast } = useToast();

  // ── selection state ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // ── data ────────────────────────────────────────────────────────────────
  const ordersQ = useMemoFirebase(
    () => (firestore ? getOrdersQuery(firestore) : null),
    [firestore],
  );

  const { data: orders, isLoading } = useCollection<Order>(ordersQ);

  const activeOrders = (orders ?? []).filter(
    (o) => !o.softDeleted && IN_PROGRESS_STATUSES.includes(o.status as OrderStatus),
  );

  // ── selection helpers ─────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === activeOrders.length && activeOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeOrders.map((o) => o.id)));
    }
  };

  // ── soft-delete (single) ──────────────────────────────────────────────
  const handleSoftDelete = useCallback(
    async (order: Order) => {
      if (!firestore || !user) return;
      setIsDeleting(true);
      try {
        await updateOrder(firestore, order.id, {
          softDeleted: true,
          updatedById: user.uid,
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(order.id);
          return next;
        });
        toast({
          title: 'Venda excluída',
          description: `Pedido #${order.id.slice(0, 8).toUpperCase()} movido para a lixeira.`,
        });
      } catch (err) {
        console.error('[VendasEmAndamento] soft-delete error:', err);
        toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível excluir a venda.' });
      } finally {
        setIsDeleting(false);
        setDeleteTarget(null);
      }
    },
    [firestore, user, toast],
  );

  // ── cancel order ──────────────────────────────────────────────────────
  const handleCancelOrder = useCallback(
    async (order: Order) => {
      if (!firestore || !user) return;
      setIsCancelling(true);
      try {
        await updateOrderStatus(firestore, order.id, 'cancelled', user.uid);
        toast({
          title: 'Pedido cancelado',
          description: `Pedido #${order.id.slice(0, 8).toUpperCase()} foi cancelado.`,
        });
      } catch (err) {
        console.error('[VendasEmAndamento] cancel error:', err);
        toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível cancelar o pedido.' });
      } finally {
        setIsCancelling(false);
        setCancelTarget(null);
      }
    },
    [firestore, user, toast],
  );

  // ── soft-delete (batch) ───────────────────────────────────────────────
  const handleBatchDelete = useCallback(async () => {
    if (!firestore || !user || selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(firestore);
      for (const id of selectedIds) {
        const ref = getOrderRef(firestore, id);
        batch.update(ref, { softDeleted: true, updatedById: user.uid });
      }
      await batch.commit();
      toast({
        title: 'Vendas excluídas',
        description: `${selectedIds.size} venda(s) movida(s) para a lixeira.`,
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error('[VendasEmAndamento] batch-delete error:', err);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível excluir as vendas.' });
    } finally {
      setIsDeleting(false);
      setShowBatchDeleteDialog(false);
    }
  }, [firestore, user, selectedIds, toast]);

  // ── loading skeleton ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // ── empty state ───────────────────────────────────────────────────────
  if (activeOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 px-6 py-16 text-center">
        <svg
          className="mb-3 h-12 w-12 text-muted-foreground/40"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
        <p className="text-sm font-medium text-muted-foreground">Nenhuma venda em andamento</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Clique em &ldquo;Nova venda&rdquo; para iniciar um pedido.
        </p>
        <Button className="mt-4" onClick={onNewVenda}>
          + Nova venda
        </Button>
      </div>
    );
  }

  // ── order list ────────────────────────────────────────────────────────
  const allSelected = selectedIds.size === activeOrders.length;

  return (
    <TooltipProvider delayDuration={300}>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Selecionar todos os pedidos"
            />
          )}
          <span className="text-sm text-muted-foreground">
            {activeOrders.length} pedido(s)
          </span>
        </div>

        {isAdmin && selectedIds.size > 0 && (
          <Button
            size="sm"
            variant="destructive"
            className="h-8 gap-1.5"
            onClick={() => setShowBatchDeleteDialog(true)}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Excluir ({selectedIds.size})</span>
          </Button>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {activeOrders.map((order) => (
          <VendaRow
            key={order.id}
            order={order}
            isAdmin={isAdmin}
            isSelected={selectedIds.has(order.id)}
            onToggleSelect={() => toggleSelect(order.id)}
            onDeleteRequest={() => setDeleteTarget(order)}
            onCancelRequest={() => setCancelTarget(order)}
          />
        ))}
      </div>

      {/* Single-delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido{' '}
              <strong>#{deleteTarget?.id.slice(0, 8).toUpperCase()}</strong> será
              movido para a lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={() => deleteTarget && handleSoftDelete(deleteTarget)}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel order confirmation dialog */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido{' '}
              <strong>#{cancelTarget?.id.slice(0, 8).toUpperCase()}</strong> será
              marcado como cancelado. Esta ação não pode ser desfeita facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isCancelling}
              onClick={() => cancelTarget && handleCancelOrder(cancelTarget)}
            >
              {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar Pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch-delete confirmation dialog */}
      <AlertDialog
        open={showBatchDeleteDialog}
        onOpenChange={(open) => { if (!open) setShowBatchDeleteDialog(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} venda(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              As vendas selecionadas serão movidas para a lixeira. Esta ação pode
              ser revertida por um administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleBatchDelete}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir {selectedIds.size} venda(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
