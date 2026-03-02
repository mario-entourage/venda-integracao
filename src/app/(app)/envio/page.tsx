'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrdersQuery, getOrderSubcollectionDocs } from '@/services/orders.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
// Per-order row: loads subcollection data and renders action buttons
// ---------------------------------------------------------------------------

type DialogType = 'tristar' | 'local_mail' | 'motoboy' | null;

interface OrderRowProps {
  order: Order;
  onShipped: (orderId: string) => void;
}

function OrderRow({ order, onShipped }: OrderRowProps) {
  const { firestore } = useFirebase();

  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [loadingSubcollections, setLoadingSubcollections] = useState(true);
  const [openDialog, setOpenDialog] = useState<DialogType>(null);

  // Load customer + shipping subcollections on mount
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
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    );
  }

  const address = shippingAddress;
  const locationStr = address ? `${address.city}/${address.state}` : '—';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        {/* Order ID */}
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

        {/* Amount */}
        <div className="flex-shrink-0">
          <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
            {fmtBRL(order.amount)}
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-shrink-0 ml-auto">
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
      </div>

      {/* Dialogs */}
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
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EnvioPage() {
  const { firestore } = useFirebase();

  // Track orders that have just been shipped (hide them optimistically)
  const [shippedIds, setShippedIds] = useState<Set<string>>(new Set());

  const ordersQuery = useMemoFirebase(
    () => (firestore ? getOrdersQuery(firestore, 'paid') : null),
    [firestore],
  );

  const { data: orders, isLoading } = useCollection<Order>(ordersQuery);

  const pendingOrders = useMemo(
    () => (orders ?? []).filter((o) => !shippedIds.has(o.id)),
    [orders, shippedIds],
  );

  const handleShipped = (orderId: string) => {
    setShippedIds((prev) => new Set([...prev, orderId]));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-2xl font-bold">Envios</h1>
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {pendingOrders.length === 0
              ? 'Nenhum pedido aguardando envio'
              : `${pendingOrders.length} pedido${pendingOrders.length !== 1 ? 's' : ''} aguardando envio`}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos pagos — aguardando envio</CardTitle>
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
          ) : pendingOrders.length === 0 ? (
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
                Nenhum pedido aguardando envio
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pedidos no status &quot;Pago&quot; aparecem aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingOrders.map((order) => (
                <OrderRow key={order.id} order={order} onShipped={handleShipped} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
