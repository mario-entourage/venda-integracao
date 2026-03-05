'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrdersQuery, getOrderSubcollectionDocs } from '@/services/orders.service';
import { getGranularStatus, IN_PROGRESS_STATUSES } from '@/lib/order-status-helpers';
import { OrderStatus } from '@/types/enums';
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
import { cn } from '@/lib/utils';
import { Truck, MoreHorizontal } from 'lucide-react';
import { TriStarDialog } from '@/components/shipping/tristar-dialog';
import { LocalMailDialog } from '@/components/shipping/local-mail-dialog';
import { MotoboyDialog } from '@/components/shipping/motoboy-dialog';
import type { Order, OrderCustomer, OrderShipping, ShippingAddress } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

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

  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [loadingSubcollections, setLoadingSubcollections] = useState(true);
  const [openDialog, setOpenDialog] = useState<DialogType>(null);

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

  // Pedido phase
  const isReadyToShip = IN_PROGRESS_STATUSES.includes(order.status as OrderStatus);
  const isInTransit = order.status === OrderStatus.SHIPPED;

  const pedidoStatusLabel = isReadyToShip
    ? 'Pronto para envio'
    : isInTransit
      ? 'Em trânsito'
      : 'Recebido';
  const pedidoStatusClass = isReadyToShip
    ? 'border-green-300 text-green-700 bg-green-50'
    : isInTransit
      ? 'border-purple-300 text-purple-700 bg-purple-50'
      : 'border-green-400 text-green-800 bg-green-100';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        {/* Date */}
        <div className="flex-shrink-0">
          <p className="text-[10px] text-muted-foreground">{fmtDate(order.createdAt as unknown as { seconds: number })}</p>
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
          <Badge variant="outline" className={cn('text-xs', pedidoStatusClass)}>
            {pedidoStatusLabel}
          </Badge>
        </div>

        {/* Amount */}
        <div className="flex-shrink-0">
          <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
            {fmtBRL(order.amount)}
          </Badge>
        </div>

        {/* Action button for current status */}
        {isReadyToShip && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Truck className="h-3.5 w-3.5 mr-1" />
                Enviar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Método de envio</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setOpenDialog('tristar')}>
                TriStar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenDialog('local_mail')}>
                Correios
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenDialog('motoboy')}>
                Motoboy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Hamburger menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 flex-shrink-0"
              aria-label="Mais ações"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Ações</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push(`/controle/${order.id}`)}>
              Ver detalhes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Shipping Dialogs */}
      {isReadyToShip && (
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
  { value: 'all', label: 'Todos' },
  { value: 'ready_to_ship', label: 'Pronto para envio' },
  { value: 'shipped', label: 'Em trânsito' },
  { value: 'delivered', label: 'Recebido' },
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
    let result = (orders ?? []).filter((o) => {
      if (o.softDeleted || shippedIds.has(o.id)) return false;
      const status = o.status as OrderStatus;

      // "Ready to ship" = in-progress with all venda steps complete
      if (IN_PROGRESS_STATUSES.includes(status)) {
        return getGranularStatus(o).missing.length === 0;
      }

      // "In transit" or "Received"
      return status === OrderStatus.SHIPPED || status === OrderStatus.DELIVERED;
    });

    if (statusFilter === 'ready_to_ship') {
      result = result.filter((o) => IN_PROGRESS_STATUSES.includes(o.status as OrderStatus));
    } else if (statusFilter === 'shipped') {
      result = result.filter((o) => o.status === OrderStatus.SHIPPED);
    } else if (statusFilter === 'delivered') {
      result = result.filter((o) => o.status === OrderStatus.DELIVERED);
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
