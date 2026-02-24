'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrdersQuery } from '@/services/orders.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';

// ─── status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'border-slate-300 text-slate-600 bg-slate-50' },
  processing: { label: 'Em andamento', className: 'border-blue-300 text-blue-700 bg-blue-50' },
  awaiting_documents: { label: 'Aguard. docs', className: 'border-amber-300 text-amber-700 bg-amber-50' },
  documents_complete: { label: 'Docs OK', className: 'border-teal-300 text-teal-700 bg-teal-50' },
  awaiting_payment: { label: 'Aguard. pagto', className: 'border-orange-300 text-orange-700 bg-orange-50' },
  paid: { label: 'Pago', className: 'border-green-300 text-green-700 bg-green-50' },
  shipped: { label: 'Enviado', className: 'border-purple-300 text-purple-700 bg-purple-50' },
  delivered: { label: 'Entregue', className: 'border-green-400 text-green-800 bg-green-100' },
  cancelled: { label: 'Cancelado', className: 'border-red-300 text-red-600 bg-red-50' },
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (ts: { seconds: number } | undefined) => {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR');
};

// ─── component ───────────────────────────────────────────────────────────────

interface VendasEmAndamentoProps {
  onNewVenda: () => void;
}

export function VendasEmAndamento({ onNewVenda }: VendasEmAndamentoProps) {
  const router = useRouter();
  const { firestore } = useFirebase();

  const ordersQ = useMemoFirebase(
    () => (firestore ? getOrdersQuery(firestore) : null),
    [firestore],
  );

  const { data: orders, isLoading } = useCollection<Order>(ordersQ);

  const activeOrders = (orders ?? []).filter((o) => o.status !== 'cancelled');

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

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
          Clique em "Nova venda" para iniciar um pedido.
        </p>
        <Button className="mt-4" onClick={onNewVenda}>
          + Nova venda
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activeOrders.map((order) => {
        const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
        return (
          <button
            key={order.id}
            type="button"
            className="w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => router.push(`/controle/${order.id}`)}
          >
            <div className="flex items-center gap-3">
              {/* Order ID */}
              <div className="flex-shrink-0 w-20">
                <p className="text-xs font-mono text-muted-foreground">
                  #{order.id.slice(0, 8).toUpperCase()}
                </p>
              </div>

              {/* Status */}
              <div className="flex-shrink-0 w-36">
                <Badge
                  variant="outline"
                  className={cn('text-xs', statusCfg.className)}
                >
                  {statusCfg.label}
                </Badge>
              </div>

              {/* Amount */}
              <div className="flex-shrink-0 w-28 text-right">
                <p className="text-sm font-semibold">{fmtBRL(order.amount)}</p>
              </div>

              {/* Date */}
              <div className="flex-shrink-0 ml-auto text-right">
                <p className="text-xs text-muted-foreground">
                  {fmtDate(order.createdAt as unknown as { seconds: number })}
                </p>
              </div>

              {/* Chevron */}
              <svg
                className="ml-2 h-4 w-4 flex-shrink-0 text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        );
      })}
    </div>
  );
}
