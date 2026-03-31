'use client';

import React, { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase';
import {
  getAnvisaEligibleOrdersQuery,
  getOrderSubcollectionRef,
} from '@/services/orders.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Order, OrderCustomer } from '@/types';

// ─── types ───────────────────────────────────────────────────────────────────

interface OrderPickerProps {
  /** Auto-select this order on mount (from ?orderId= query param) */
  preselectedOrderId?: string;
  onOrderSelected: (orderId: string, prescriptionDocId: string) => void;
  onSkip: () => void;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (ts: unknown) => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleDateString('pt-BR');
};

// ─── component ───────────────────────────────────────────────────────────────

export function OrderPicker({ preselectedOrderId, onOrderSelected, onSkip }: OrderPickerProps) {
  const { firestore } = useFirebase();

  // Query eligible orders
  const ordersQ = useMemoFirebase(
    () => (firestore ? getAnvisaEligibleOrdersQuery(firestore) : null),
    [firestore],
  );
  const { data: allOrders, isLoading } = useCollection<Order>(ordersQ);

  // Filter client-side for conditions that can't be compound-queried easily in Firestore
  const eligibleOrders = (allOrders ?? []).filter(
    (o) =>
      !o.anvisaRequestId &&
      o.anvisaOption !== 'exempt' &&
      !o.softDeleted &&
      o.status !== 'cancelled',
  );

  // Load customer names for display
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!firestore || eligibleOrders.length === 0) return;

    const loadCustomers = async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        eligibleOrders.map(async (order) => {
          try {
            const snap = await getDocs(
              getOrderSubcollectionRef(firestore, order.id, 'customer'),
            );
            const customer = snap.docs[0]?.data() as OrderCustomer | undefined;
            if (customer) {
              map[order.id] = customer.name;
            }
          } catch {
            // Non-fatal — customer name will show as '—'
          }
        }),
      );
      setCustomerMap(map);
    };

    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, eligibleOrders.length]);

  // Auto-select if preselectedOrderId is provided
  useEffect(() => {
    if (!preselectedOrderId || eligibleOrders.length === 0) return;
    const order = eligibleOrders.find((o) => o.id === preselectedOrderId);
    if (order && order.prescriptionDocId) {
      onOrderSelected(order.id, order.prescriptionDocId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedOrderId, eligibleOrders.length]);

  // ── loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Carregando pedidos...
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vincular a um Pedido</CardTitle>
        <p className="text-sm text-muted-foreground">
          Selecione um pedido para importar a receita automaticamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {eligibleOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum pedido elegível encontrado.
          </p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {eligibleOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                className="w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => {
                  if (order.prescriptionDocId) {
                    onOrderSelected(order.id, order.prescriptionDocId);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {order.anvisaOption === 'regular' ? 'Regular' : 'Especial'}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium mt-0.5 truncate">
                    {customerMap[order.id] ?? '—'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmtDate(order.createdAt)}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onSkip}>
            Criar sem pedido
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
