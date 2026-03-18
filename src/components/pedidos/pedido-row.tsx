'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { friendlyError } from '@/lib/friendly-error';
import {
  Loader2,
  MoreHorizontal,
  DollarSign,
  FileText,
  Shield,
  PenTool,
  FileCheck,
  RefreshCw,
  XCircle,
  Trash2,
} from 'lucide-react';
import { useFirebase } from '@/firebase/provider';
import {
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  getGranularStatus,
  EXTENDED_STATUS_CONFIG,
  isReadyToShip,
} from '@/lib/order-status-helpers';
import { OrderStatus, AnvisaOption } from '@/types/enums';
import { TriStarDialog } from '@/components/shipping/tristar-dialog';
import { LocalMailDialog } from '@/components/shipping/local-mail-dialog';
import { MotoboyDialog } from '@/components/shipping/motoboy-dialog';
import type { Order, OrderCustomer, OrderShipping, ShippingAddress } from '@/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (ts: { seconds: number } | undefined) => {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR');
};

// ─── missing-item indicator config ───────────────────────────────────────────

export const MISSING_ITEM_CONFIG: Record<
  string,
  { icon: React.ElementType; abbr: string; className: string }
> = {
  Pagamento: {
    icon: DollarSign,
    abbr: 'Pgto',
    className: 'border-orange-300 text-orange-700 bg-orange-50',
  },
  Documentos: {
    icon: FileText,
    abbr: 'Docs',
    className: 'border-amber-300 text-amber-700 bg-amber-50',
  },
  ANVISA: {
    icon: Shield,
    abbr: 'ANV',
    className: 'border-purple-300 text-purple-700 bg-purple-50',
  },
  'ANVISA (em andamento)': {
    icon: Shield,
    abbr: 'ANV\u2026',
    className: 'border-purple-200 text-purple-500 bg-purple-50',
  },
  'Procuracao (assinatura)': {
    icon: PenTool,
    abbr: 'Proc',
    className: 'border-blue-300 text-blue-700 bg-blue-50',
  },
  Comprovante: {
    icon: FileCheck,
    abbr: 'CV',
    className: 'border-blue-300 text-blue-700 bg-blue-50',
  },
};

// ─── base status labels ──────────────────────────────────────────────────────

const BASE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  awaiting_documents: 'Aguard. docs',
  documents_complete: 'Docs OK',
  awaiting_payment: 'Aguard. pgto',
  paid: 'Pago',
};

// ─── PedidoRow ───────────────────────────────────────────────────────────────

type DialogType = 'tristar' | 'local_mail' | 'motoboy' | null;

export interface PedidoRowProps {
  order: Order;
  isAdmin: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDeleteRequest: () => void;
  onCancelRequest: () => void;
  onShipped: (orderId: string) => void;
}

export function PedidoRow({
  order,
  isAdmin,
  isSelected,
  onToggleSelect,
  onDeleteRequest,
  onCancelRequest,
  onShipped,
}: PedidoRowProps) {
  const { firestore, user } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  // ── load subcollections ─────────────────────────────────────────────────
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [repName, setRepName] = useState<string | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;

    async function load() {
      if (!firestore) return;
      try {
        const [customers, shippings, reps] = await Promise.all([
          getOrderSubcollectionDocs<OrderCustomer>(firestore, order.id, 'customer'),
          getOrderSubcollectionDocs<OrderShipping>(firestore, order.id, 'shipping'),
          getOrderSubcollectionDocs<{ name?: string }>(firestore, order.id, 'representative'),
        ]);
        if (cancelled) return;
        setCustomer(customers[0] ?? null);
        setShippingAddress(shippings[0]?.address ?? null);
        const rn = reps[0]?.name;
        setRepName(rn && rn !== 'Venda Direta' ? rn : null);
      } catch (err) {
        console.error('[PedidoRow] subcollection load:', err);
      } finally {
        if (!cancelled) setLoadingSub(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [firestore, order.id]);

  // ── inline action states ────────────────────────────────────────────────
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRegeneratingLink, setIsRegeneratingLink] = useState(false);
  const [openDialog, setOpenDialog] = useState<DialogType>(null);

  // ── derived flags ───────────────────────────────────────────────────────
  const granular = getGranularStatus(order);
  const baseLabel = BASE_STATUS_LABELS[order.status] ?? order.status;
  const ready = isReadyToShip(order);
  const statusCfg = ready
    ? EXTENDED_STATUS_CONFIG.pronto
    : (EXTENDED_STATUS_CONFIG[order.status] ?? EXTENDED_STATUS_CONFIG.pending);

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
  const hasWorkflowSteps =
    notPaid || !order.documentsComplete || showAnvisa || canMarkProcSigned || canMarkCvSigned;

  const locationStr = shippingAddress
    ? `${shippingAddress.city}/${shippingAddress.state}`
    : null;

  // ── actions ─────────────────────────────────────────────────────────────
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
      toast({
        title: field === 'zapsignStatus' ? 'Procuracao marcada.' : 'Comprovante marcado.',
      });
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
        undefined, // allowedPaymentMethods
        repName || undefined, // repDisplayName → generates invoice number
      );
      if (result.error || !result.paymentUrl) {
        throw new Error(result.error || 'Link nao retornado.');
      }
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      await createPaymentLink(firestore, order.id, {
        amount: order.amount,
        currency: order.currency || 'USD',
        referenceId: result.invoiceNumber || result.gpOrderId,
        paymentUrl: result.paymentUrl,
        provider: 'globalpay',
        expiresAt,
        repName: repName || undefined,
        invoice: result.invoiceNumber,
        clientName: customer?.name || undefined,
      });
      try {
        await navigator.clipboard.writeText(result.paymentUrl);
        toast({ title: 'Link regenerado e copiado.' });
      } catch {
        toast({ title: 'Link regenerado com sucesso.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: friendlyError(err, 'Erro ao regenerar link.') });
    } finally {
      setIsRegeneratingLink(false);
    }
  };

  const handleShipSuccess = () => {
    setOpenDialog(null);
    onShipped(order.id);
  };

  // ── loading skeleton ────────────────────────────────────────────────────
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
    <>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors sm:gap-3 sm:px-4 sm:py-3',
          ready && 'ring-2 ring-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20',
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

        {/* Clickable area -> detail */}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-w-0 sm:gap-3"
          onClick={() => router.push(`/controle/${order.id}`)}
        >
          {/* ID + invoice + date */}
          <div className="flex-shrink-0 w-[5.5rem]">
            {order.invoice ? (
              <p className="text-xs font-mono font-semibold text-primary truncate">
                {order.invoice}
              </p>
            ) : (
              <p className="text-xs font-mono text-muted-foreground">
                #{order.id.slice(0, 8).toUpperCase()}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              {fmtDate(order.createdAt as unknown as { seconds: number })}
            </p>
          </div>

          {/* Customer name + CPF */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{customer?.name ?? '—'}</p>
            {customer?.document && (
              <p className="text-xs text-muted-foreground">CPF: {customer.document}</p>
            )}
          </div>

          {/* Sales rep */}
          {repName && (
            <div className="hidden sm:block w-28 flex-shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rep</p>
              <p className="text-xs font-medium truncate">{repName}</p>
            </div>
          )}

          {/* Location (if available) */}
          {locationStr && (
            <div className="hidden sm:block w-28 flex-shrink-0">
              <p className="text-sm text-muted-foreground">{locationStr}</p>
            </div>
          )}

          {/* Status badge */}
          {ready ? (
            <Badge
              variant="outline"
              className={cn('text-[10px] flex-shrink-0 whitespace-nowrap', EXTENDED_STATUS_CONFIG.pronto.className)}
            >
              Pronto p/ envio
            </Badge>
          ) : (
            <>
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
            </>
          )}

          {/* Amount */}
          <div className="flex-shrink-0 text-right">
            <p className="text-sm font-semibold">{fmtBRL(order.amount)}</p>
          </div>
        </button>

        {/* Shipping buttons (only when ready to ship) */}
        {ready && (
          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => setOpenDialog('tristar')}
            >
              TriStar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenDialog('local_mail')}
            >
              Correios
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={() => setOpenDialog('motoboy')}
            >
              Motoboy
            </Button>
          </div>
        )}

        {/* Hamburger menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 flex-shrink-0"
              aria-label="Acoes do pedido"
              disabled={isRegeneratingLink || isUpdating}
            >
              {isRegeneratingLink || isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Workflow steps (pre-shipping) */}
            {hasWorkflowSteps && (
              <>
                <DropdownMenuLabel>Proximos Passos</DropdownMenuLabel>
                {notPaid && (
                  <DropdownMenuItem onClick={handleMarkPaid} disabled={isUpdating}>
                    <DollarSign className="mr-2 h-4 w-4 text-green-600" />
                    Marcar como Pago
                  </DropdownMenuItem>
                )}
                {!order.documentsComplete && (
                  <DropdownMenuItem onClick={() => router.push(`/controle/${order.id}`)}>
                    <FileText className="mr-2 h-4 w-4 text-amber-600" />
                    Documentos
                  </DropdownMenuItem>
                )}
                {showAnvisa && (
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(
                        order.anvisaRequestId
                          ? `/anvisa/${order.anvisaRequestId}`
                          : `/anvisa/nova?orderId=${order.id}`,
                      )
                    }
                  >
                    <Shield className="mr-2 h-4 w-4 text-purple-600" />
                    {order.anvisaRequestId ? 'Ver ANVISA' : 'Criar ANVISA'}
                  </DropdownMenuItem>
                )}
                {canMarkProcSigned && (
                  <DropdownMenuItem
                    onClick={() => handleMarkSigned('zapsignStatus')}
                    disabled={isUpdating}
                  >
                    <PenTool className="mr-2 h-4 w-4 text-blue-600" />
                    Marcar Procuracao Assinada
                  </DropdownMenuItem>
                )}
                {canMarkCvSigned && (
                  <DropdownMenuItem
                    onClick={() => handleMarkSigned('zapsignCvStatus')}
                    disabled={isUpdating}
                  >
                    <FileCheck className="mr-2 h-4 w-4 text-blue-600" />
                    Marcar Comprovante Assinado
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {/* General actions */}
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

      {/* Shipping dialogs (only when ready) */}
      {ready && (
        <>
          <TriStarDialog
            open={openDialog === 'tristar'}
            onOpenChange={(o) => !o && setOpenDialog(null)}
            order={order}
            customer={customer}
            shippingAddress={shippingAddress}
            onSuccess={handleShipSuccess}
          />
          <LocalMailDialog
            open={openDialog === 'local_mail'}
            onOpenChange={(o) => !o && setOpenDialog(null)}
            order={order}
            customer={customer}
            shippingAddress={shippingAddress}
            onSuccess={handleShipSuccess}
          />
          <MotoboyDialog
            open={openDialog === 'motoboy'}
            onOpenChange={(o) => !o && setOpenDialog(null)}
            order={order}
            customer={customer}
            shippingAddress={shippingAddress}
            onSuccess={handleShipSuccess}
          />
        </>
      )}
    </>
  );
}
