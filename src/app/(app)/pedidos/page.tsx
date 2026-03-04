'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrdersQuery, getOrderSubcollectionDocs } from '@/services/orders.service';
import { generatePaymentLink } from '@/server/actions/payment.actions';
import { createPaymentLink } from '@/services/payments.service';
import { getGranularStatus, EXTENDED_STATUS_CONFIG, IN_PROGRESS_STATUSES } from '@/lib/order-status-helpers';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { OrderStatus, AnvisaOption } from '@/types/enums';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { FileText, Shield, MoreHorizontal, RefreshCw, Loader2 } from 'lucide-react';
import { TriStarDialog } from '@/components/shipping/tristar-dialog';
import { LocalMailDialog } from '@/components/shipping/local-mail-dialog';
import { MotoboyDialog } from '@/components/shipping/motoboy-dialog';
import type { Order, OrderCustomer, OrderShipping, ShippingAddress } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (ts: { seconds: number } | undefined) => {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR');
};

// ---------------------------------------------------------------------------
// Per-order row
// ---------------------------------------------------------------------------

type DialogType = 'tristar' | 'local_mail' | 'motoboy' | null;

interface OrderRowProps {
  order: Order;
  onShipped: (orderId: string) => void;
}

function OrderRow({ order, onShipped }: OrderRowProps) {
  const { firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [loadingSubcollections, setLoadingSubcollections] = useState(true);
  const [openDialog, setOpenDialog] = useState<DialogType>(null);
  const [isRegeneratingLink, setIsRegeneratingLink] = useState(false);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;

    async function load() {
      if (!firestore) return;
      try {
        const [customers, shippings] = await Promise.all([
          getOrderSubcollectionDocs<OrderCustomer>(firestore, order.id, 'customer'),
          getOrderSubcollectionDocs<OrderShipping>(firestore, order.id, 'shipping'),
        ]);
        if (cancelled) return;
        setCustomer(customers[0] ?? null);
        setShippingAddress(shippings[0]?.address ?? null);
      } catch (err) {
        console.error('[OrderRow] Failed to load subcollections:', err);
      } finally {
        if (!cancelled) setLoadingSubcollections(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [firestore, order.id]);

  const handleSuccess = () => {
    setOpenDialog(null);
    onShipped(order.id);
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
        throw new Error(result.error || 'Link nao retornado.');
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
        toast({ title: 'Link regenerado e copiado para a area de transferencia.' });
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

  if (loadingSubcollections) {
    return (
      <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-24 ml-auto" />
        <Skeleton className="h-8 w-20" />
      </div>
    );
  }

  const address = shippingAddress;
  const locationStr = address ? `${address.city}/${address.state}` : '—';

  // Granular status
  const granular = getGranularStatus(order);
  const statusCfg = EXTENDED_STATUS_CONFIG[granular.configKey] ?? EXTENDED_STATUS_CONFIG.pending;

  // Conditional action buttons
  const showAddDocuments = !order.documentsComplete;
  const needsAnvisa =
    !!order.anvisaOption && order.anvisaOption !== AnvisaOption.EXEMPT;
  const anvisaConcluded =
    order.anvisaStatus === 'CONCLUIDO' || order.anvisaStatus === 'concluido';
  const showAnvisa = needsAnvisa && !anvisaConcluded;
  const isPaid = order.status === 'paid';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        {/* Order ID + date */}
        <div className="w-24 flex-shrink-0">
          <p className="text-xs font-mono text-muted-foreground">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-muted-foreground">{fmtDate(order.createdAt as unknown as { seconds: number })}</p>
        </div>

        {/* Customer name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{customer?.name ?? '—'}</p>
          {customer?.document && (
            <p className="text-xs text-muted-foreground">CPF: {customer.document}</p>
          )}
        </div>

        {/* Location */}
        <div className="hidden sm:block w-28 flex-shrink-0">
          <p className="text-sm text-muted-foreground">{locationStr}</p>
        </div>

        {/* Status badge */}
        <div className="flex-shrink-0">
          <Badge variant="outline" className={cn('text-xs', statusCfg.className)}>
            {granular.label}
          </Badge>
        </div>

        {/* Amount */}
        <div className="flex-shrink-0">
          <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
            {fmtBRL(order.amount)}
          </Badge>
        </div>

        {/* Conditional action buttons */}
        <div className="flex gap-2 flex-shrink-0">
          {showAddDocuments && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/controle/${order.id}`)}
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Docs
            </Button>
          )}
          {showAnvisa && (
            <Button
              size="sm"
              variant="outline"
              className="text-purple-600 border-purple-200 hover:bg-purple-50"
              onClick={() => router.push('/anvisa/nova')}
            >
              <Shield className="h-3.5 w-3.5 mr-1" />
              ANVISA
            </Button>
          )}
        </div>

        {/* Shipping buttons (paid orders only) */}
        {isPaid && (
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
              className="h-8 w-8 flex-shrink-0"
              aria-label="Mais acoes"
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
            <DropdownMenuLabel>Acoes</DropdownMenuLabel>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Shipping Dialogs */}
      {isPaid && (
        <>
          <TriStarDialog
            open={openDialog === 'tristar'}
            onOpenChange={(o) => !o && setOpenDialog(null)}
            order={order}
            customer={customer}
            shippingAddress={shippingAddress}
            onSuccess={handleSuccess}
          />
          <LocalMailDialog
            open={openDialog === 'local_mail'}
            onOpenChange={(o) => !o && setOpenDialog(null)}
            order={order}
            customer={customer}
            shippingAddress={shippingAddress}
            onSuccess={handleSuccess}
          />
          <MotoboyDialog
            open={openDialog === 'motoboy'}
            onOpenChange={(o) => !o && setOpenDialog(null)}
            order={order}
            customer={customer}
            shippingAddress={shippingAddress}
            onSuccess={handleSuccess}
          />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Status filter options
// ---------------------------------------------------------------------------

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos em andamento' },
  ...IN_PROGRESS_STATUSES.map((s) => ({
    value: s,
    label: ORDER_STATUS_LABELS[s as OrderStatus] ?? s,
  })),
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PedidosPage() {
  const { firestore } = useFirebase();

  const [statusFilter, setStatusFilter] = useState('all');
  const [shippedIds, setShippedIds] = useState<Set<string>>(new Set());

  const ordersQuery = useMemoFirebase(
    () => (firestore ? getOrdersQuery(firestore) : null),
    [firestore],
  );

  const { data: orders, isLoading } = useCollection<Order>(ordersQuery);

  const filteredOrders = useMemo(() => {
    let result = (orders ?? []).filter(
      (o) =>
        !o.softDeleted &&
        !shippedIds.has(o.id) &&
        IN_PROGRESS_STATUSES.includes(o.status as OrderStatus),
    );
    if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }
    return result;
  }, [orders, statusFilter, shippedIds]);

  const handleShipped = (orderId: string) => {
    setShippedIds((prev) => new Set([...prev, orderId]));
  };

  return (
    <div className="space-y-6">
      {/* Header with filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-bold">Pedidos</h1>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isLoading && (
            <p className="text-sm text-muted-foreground">
              {filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos em Andamento</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 rounded-lg border px-4 py-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24 ml-auto" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
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
                  d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                />
              </svg>
              <p className="text-sm font-medium text-muted-foreground">
                {statusFilter === 'all'
                  ? 'Nenhum pedido encontrado'
                  : 'Nenhum pedido com esse status'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map((order) => (
                <OrderRow key={order.id} order={order} onShipped={handleShipped} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
