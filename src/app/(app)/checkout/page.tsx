'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import {
  getOrdersQuery,
  getOrdersByCreatorQuery,
  getOrderSubcollectionDocs,
} from '@/services/orders.service';
import { getOrderPaymentLinks } from '@/services/payments.service';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Order, OrderCustomer, PaymentLink } from '@/types';

// ─── status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  created:   { label: 'Aguardando',  className: 'border-amber-300 text-amber-700 bg-amber-50' },
  pending:   { label: 'Pendente',    className: 'border-amber-300 text-amber-700 bg-amber-50' },
  paid:      { label: 'Pago',        className: 'border-green-300 text-green-700 bg-green-50' },
  approved:  { label: 'Aprovado',    className: 'border-green-300 text-green-700 bg-green-50' },
  completed: { label: 'Concluído',   className: 'border-green-400 text-green-800 bg-green-100' },
  success:   { label: 'Concluído',   className: 'border-green-400 text-green-800 bg-green-100' },
  failed:    { label: 'Falhou',      className: 'border-red-300 text-red-600 bg-red-50' },
  cancelled: { label: 'Cancelado',   className: 'border-red-300 text-red-600 bg-red-50' },
  expired:   { label: 'Expirado',    className: 'border-slate-300 text-slate-500 bg-slate-50' },
};

function statusConfig(s: string) {
  return STATUS_CONFIG[s] ?? {
    label: s,
    className: 'border-slate-300 text-slate-600 bg-slate-50',
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const fmtDate = (ts: unknown) => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleDateString('pt-BR');
};

// ─── row type ─────────────────────────────────────────────────────────────────

type PaymentRow = {
  link: PaymentLink & { id: string; paymentUrl?: string };
  orderId: string;
  customerName: string;
};

// ─── component ───────────────────────────────────────────────────────────────

export default function PagamentosPage() {
  const router = useRouter();
  const { firestore, user, isAdmin } = useFirebase();

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // orders subscription
  const ordersQ = useMemoFirebase(
    () => {
      if (!firestore || !user) return null;
      return isAdmin
        ? getOrdersQuery(firestore)
        : getOrdersByCreatorQuery(firestore, user.uid);
    },
    [firestore, user, isAdmin],
  );
  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(ordersQ);

  // batch-load payment links + customer names whenever orders change
  useEffect(() => {
    if (!firestore || !orders) return;
    if (orders.length === 0) {
      setRows([]);
      return;
    }

    setLoadingLinks(true);
    setLoadError(null);

    Promise.all(
      orders.map(async (order) => {
        const [links, customers] = await Promise.all([
          getOrderPaymentLinks(firestore, order.id),
          getOrderSubcollectionDocs<OrderCustomer>(firestore, order.id, 'customer'),
        ]);
        const customerName = customers[0]?.name ?? '—';
        return links.map((link) => ({
          link: link as PaymentLink & { id: string; paymentUrl?: string },
          orderId: order.id,
          customerName,
        }));
      }),
    )
      .then((nested) => {
        const flat = nested.flat();
        flat.sort((a, b) => {
          const aS = (a.link.createdAt as unknown as { seconds: number })?.seconds ?? 0;
          const bS = (b.link.createdAt as unknown as { seconds: number })?.seconds ?? 0;
          return bS - aS;
        });
        setRows(flat);
      })
      .catch((err) => {
        console.error('[PagamentosPage] load error:', err);
        setLoadError('Não foi possível carregar os links de pagamento. Recarregue a página e tente novamente.');
      })
      .finally(() => setLoadingLinks(false));
  }, [firestore, orders]);

  const isLoading = ordersLoading || loadingLinks;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Pagamentos</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? 'Todos os links de pagamento gerados na plataforma.'
            : 'Links de pagamento gerados por você.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAdmin ? 'Todos os Links de Pagamento' : 'Meus Links de Pagamento'}
          </CardTitle>
          {!isLoading && (
            <CardDescription>
              {rows.length} link{rows.length !== 1 ? 's' : ''} encontrado{rows.length !== 1 ? 's' : ''}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 px-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3 px-6">
              <p className="text-sm text-destructive">{loadError}</p>
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => window.location.reload()}
              >
                Recarregar página
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg
                className="mb-3 h-10 w-10 text-muted-foreground/40"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
                />
              </svg>
              <p className="text-sm font-medium text-muted-foreground">
                Nenhum link de pagamento encontrado
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Links gerados durante o fluxo de vendas aparecem aqui.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 pl-6 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">
                      Valor
                    </th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">
                      Cliente
                    </th>
                    {isAdmin && (
                      <th className="pb-2 text-left font-medium text-muted-foreground hidden md:table-cell">
                        Pedido
                      </th>
                    )}
                    <th className="pb-2 pr-6 text-right font-medium text-muted-foreground">
                      Data de Criação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ link, orderId, customerName }) => {
                    const cfg = statusConfig(link.status);
                    return (
                      <tr
                        key={`${orderId}-${link.id}`}
                        className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() =>
                          router.push(`/checkout/${orderId}/${link.id}`)
                        }
                      >
                        <td className="py-3 pl-6">
                          <Badge variant="outline" className={cn('text-xs', cfg.className)}>
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="py-3 font-medium tabular-nums">
                          {fmtAmount(link.amount, link.currency)}
                        </td>
                        <td className="py-3">
                          {customerName || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3 hidden md:table-cell">
                            <span
                              className="font-mono text-xs text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/controle/${orderId}`);
                              }}
                            >
                              #{orderId.slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                        )}
                        <td className="py-3 pr-6 text-right text-muted-foreground">
                          {fmtDate(link.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
