'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { collection, collectionGroup, query, where, orderBy, limit } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrdersQuery, getOrdersByCreatorQuery } from '@/services/orders.service';
import { getUsersRef } from '@/services/users.service';
import { OrderStatus } from '@/types/enums';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';
import type { Prescription } from '@/types/prescription';
import type { Payment } from '@/types/payment';
import type { ShippingRecord } from '@/types/shipping';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (ts: unknown) => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleDateString('pt-BR');
};

const REVENUE_STATUSES = new Set<string>([
  OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED,
]);

function getMonthBounds(monthOffset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function orderCreatedAt(order: Order): Date {
  const ts = order.createdAt as unknown as { seconds: number };
  return new Date(ts.seconds * 1000);
}

function revenueForPeriod(orders: Order[], start: Date, end: Date): number {
  return orders
    .filter((o) => {
      if (!REVENUE_STATUSES.has(o.status) || o.softDeleted) return false;
      const d = orderCreatedAt(o);
      return d >= start && d <= end;
    })
    .reduce((sum, o) => sum + (o.amount ?? 0), 0);
}

/** Check whether a Firestore Timestamp falls within the current calendar month. */
function tsInCurrentMonth(ts: unknown): boolean {
  if (!ts) return false;
  const t = ts as { seconds?: number; toDate?: () => Date };
  let date: Date;
  if (typeof t.toDate === 'function') {
    date = t.toDate();
  } else if (t.seconds != null) {
    date = new Date(t.seconds * 1000);
  } else {
    return false;
  }
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

// ─── status config ────────────────────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
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

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  sub,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 rounded bg-muted animate-pulse" />
        ) : (
          <>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusCountCard({
  label,
  count,
  className,
  loading,
}: {
  label: string;
  count: number;
  className: string;
  loading?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border px-3 py-2.5 flex items-center justify-between gap-2', className)}>
      <span className="text-xs font-medium leading-tight">{label}</span>
      {loading ? (
        <div className="h-5 w-6 rounded bg-current opacity-20 animate-pulse flex-shrink-0" />
      ) : (
        <span className="text-sm font-bold flex-shrink-0">{count}</span>
      )}
    </div>
  );
}

function RecentOrdersTable({
  orders,
  loading,
  emptyText = 'Nenhum pedido encontrado.',
}: {
  orders: Order[];
  loading: boolean;
  emptyText?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pedidos Recentes</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="space-y-2 px-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pl-6 text-left font-medium text-muted-foreground w-28">ID</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground w-32">Valor</th>
                  <th className="pb-2 pr-6 text-right font-medium text-muted-foreground w-28">Data</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const cfg = ORDER_STATUS_CONFIG[order.status] ?? ORDER_STATUS_CONFIG.pending;
                  return (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2.5 pl-6">
                        <Link
                          href={`/controle/${order.id}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          #{order.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline" className={cn('text-xs', cfg.className)}>
                          {cfg.label}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-medium">{fmtBRL(order.amount ?? 0)}</td>
                      <td className="py-2.5 pr-6 text-right text-muted-foreground">
                        {fmtDate(order.createdAt)}
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
  );
}

// ─── admin dashboard ──────────────────────────────────────────────────────────

function AdminDashboard() {
  const { firestore } = useFirebase();

  // All orders (real-time)
  const allOrdersQ = useMemoFirebase(
    () => (firestore ? getOrdersQuery(firestore) : null),
    [firestore],
  );
  const { data: allOrders, isLoading: ordersLoading } = useCollection<Order>(allOrdersQ);

  // Active users count
  const usersQ = useMemoFirebase(
    () =>
      firestore
        ? query(getUsersRef(firestore), where('active', '==', true))
        : null,
    [firestore],
  );
  const { data: activeUsers, isLoading: usersLoading } =
    useCollection<{ id: string }>(usersQ);

  // ── Auxiliary queries for current-month filtering ──────────────────────────

  // Prescriptions (top-level collection — limit to most recent 500)
  const prescriptionsQ = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'prescriptions'), orderBy('createdAt', 'desc'), limit(500)) : null),
    [firestore],
  );
  const { data: allPrescriptions, isLoading: prescriptionsLoading } =
    useCollection<Prescription>(prescriptionsQ);

  // Payments (subcollection group — limit to most recent 500)
  const paymentsGroupQ = useMemoFirebase(
    () => (firestore ? query(collectionGroup(firestore, 'payments'), orderBy('createdAt', 'desc'), limit(500)) : null),
    [firestore],
  );
  const { data: allPayments, isLoading: paymentsLoading } =
    useCollection<Payment>(paymentsGroupQ);

  // Shipping records (subcollection group — limit to most recent 500)
  const shippingGroupQ = useMemoFirebase(
    () => (firestore ? query(collectionGroup(firestore, 'shipping'), orderBy('createdAt', 'desc'), limit(500)) : null),
    [firestore],
  );
  const { data: allShipping, isLoading: shippingLoading } =
    useCollection<ShippingRecord>(shippingGroupQ);

  // ── derived stats ──────────────────────────────────────────────────────────
  const activeOrders = useMemo(
    () => (allOrders ?? []).filter((o) => !o.softDeleted),
    [allOrders],
  );

  const { start: thisStart, end: thisEnd } = useMemo(() => getMonthBounds(0), []);
  const { start: lastStart, end: lastEnd } = useMemo(() => getMonthBounds(-1), []);

  const thisMonthRevenue = useMemo(
    () => revenueForPeriod(activeOrders, thisStart, thisEnd),
    [activeOrders, thisStart, thisEnd],
  );
  const lastMonthRevenue = useMemo(
    () => revenueForPeriod(activeOrders, lastStart, lastEnd),
    [activeOrders, lastStart, lastEnd],
  );

  const pendingCount = useMemo(
    () => activeOrders.filter((o) => o.status === OrderStatus.PENDING).length,
    [activeOrders],
  );

  // ── Build lookup maps for current-month filtering ─────────────────────────

  const prescriptionsByOrderId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of allPrescriptions ?? []) {
      if (p.orderId) map.set(p.orderId, p.prescriptionDate);
    }
    return map;
  }, [allPrescriptions]);

  const paymentsByOrderId = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of allPayments ?? []) {
      if (!p.orderId) continue;
      if (!map.has(p.orderId)) map.set(p.orderId, []);
      map.get(p.orderId)!.push(p);
    }
    return map;
  }, [allPayments]);

  const shippingByOrderId = useMemo(() => {
    const map = new Map<string, ShippingRecord[]>();
    for (const s of allShipping ?? []) {
      if (!s.orderId) continue;
      if (!map.has(s.orderId)) map.set(s.orderId, []);
      map.get(s.orderId)!.push(s);
    }
    return map;
  }, [allShipping]);

  // ── Filter orders relevant to the current month ───────────────────────────

  const currentMonthOrders = useMemo(() => {
    const now = new Date();
    const yearMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return activeOrders.filter((order) => {
      // 1. The Pedido was started in the current month
      if (tsInCurrentMonth(order.createdAt)) return true;

      // 2. The Pedido is associated with a prescription written in the current month
      const rxDate = prescriptionsByOrderId.get(order.id);
      if (rxDate && rxDate.startsWith(yearMonthPrefix)) return true;

      // 3. Payment was made in the current month
      const payments = paymentsByOrderId.get(order.id);
      if (payments?.some((p) => tsInCurrentMonth(p.paymentDate))) return true;

      // 4. The ZapSign authorization was signed in the current month
      if (order.zapsignStatus === 'signed' && tsInCurrentMonth(order.updatedAt)) return true;

      // 5. The ANVISA Solicitação was submitted in the current month
      //    (No direct link between anvisa_requests and orders — skipped)

      // 6. The Data do Envio was in the current month
      const shipments = shippingByOrderId.get(order.id);
      if (shipments?.some((s) => s.sendDate && s.sendDate.startsWith(yearMonthPrefix))) return true;

      // 7. The Previsão de Entrega is in the current month
      //    (Field does not exist in the data model — skipped)

      return false;
    });
  }, [activeOrders, prescriptionsByOrderId, paymentsByOrderId, shippingByOrderId]);

  // ── Status counts from current-month filtered orders ──────────────────────

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const status of Object.values(OrderStatus)) counts[status] = 0;
    for (const o of currentMonthOrders) {
      if (counts[o.status] !== undefined) counts[o.status]++;
    }
    return counts;
  }, [currentMonthOrders]);

  const recentOrders = useMemo(() => activeOrders.slice(0, 5), [activeOrders]);

  const now = new Date();
  const thisMonthName = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthName = lastMonthDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  // Combined loading state for the status section
  const statusSectionLoading = ordersLoading || prescriptionsLoading || paymentsLoading || shippingLoading;

  // Only show statuses that have at least one order
  const visibleStatuses = Object.entries(ORDER_STATUS_CONFIG).filter(
    ([status]) => (statusCounts[status] ?? 0) > 0,
  );

  return (
    <div className="space-y-6">

      {/* ── Row 1: Key metrics ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Faturamento (Mês Atual)"
          value={fmtBRL(thisMonthRevenue)}
          sub={thisMonthName}
          loading={ordersLoading}
        />
        <StatCard
          title="Faturamento (Mês Anterior)"
          value={fmtBRL(lastMonthRevenue)}
          sub={lastMonthName}
          loading={ordersLoading}
        />
        <StatCard
          title="Pedidos Pendentes"
          value={String(pendingCount)}
          loading={ordersLoading}
        />
        <StatCard
          title="Usuários Ativos"
          value={String(activeUsers?.length ?? 0)}
          loading={usersLoading}
        />
      </div>

      {/* ── Row 2: Orders by status (current month only, non-empty statuses) ── */}
      {(statusSectionLoading || visibleStatuses.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pedidos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusSectionLoading ? (
              <div className="grid gap-2 grid-cols-3 sm:grid-cols-5 lg:grid-cols-9">
                {Object.entries(ORDER_STATUS_CONFIG).map(([status, cfg]) => (
                  <StatusCountCard
                    key={status}
                    label={cfg.label}
                    count={0}
                    className={cfg.className}
                    loading
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-3 sm:grid-cols-5 lg:grid-cols-9">
                {visibleStatuses.map(([status, cfg]) => (
                  <StatusCountCard
                    key={status}
                    label={cfg.label}
                    count={statusCounts[status] ?? 0}
                    className={cfg.className}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Row 3: Recent orders ── */}
      <RecentOrdersTable orders={recentOrders} loading={ordersLoading} />
    </div>
  );
}

// ─── user dashboard ───────────────────────────────────────────────────────────

function UserDashboard() {
  const { firestore, user } = useFirebase();

  const myOrdersQ = useMemoFirebase(
    () => (firestore && user ? getOrdersByCreatorQuery(firestore, user.uid) : null),
    [firestore, user],
  );
  const { data: myOrders, isLoading } = useCollection<Order>(myOrdersQ);

  const activeOrders = useMemo(
    () => (myOrders ?? []).filter((o) => !o.softDeleted && o.status !== OrderStatus.CANCELLED),
    [myOrders],
  );

  const awaitingPayment = useMemo(
    () => activeOrders.filter((o) => o.status === OrderStatus.AWAITING_PAYMENT).length,
    [activeOrders],
  );

  const delivered = useMemo(
    () => (myOrders ?? []).filter((o) => o.status === OrderStatus.DELIVERED).length,
    [myOrders],
  );

  const { start: thisStart, end: thisEnd } = useMemo(() => getMonthBounds(0), []);
  const thisMonthRevenue = useMemo(
    () => revenueForPeriod(activeOrders, thisStart, thisEnd),
    [activeOrders, thisStart, thisEnd],
  );

  const recentOrders = useMemo(() => (myOrders ?? []).slice(0, 5), [myOrders]);

  const now = new Date();
  const thisMonthName = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">

      {/* ── Row 1: My metrics ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pedidos Ativos"
          value={String(activeOrders.length)}
          loading={isLoading}
        />
        <StatCard
          title="Aguardando Pagamento"
          value={String(awaitingPayment)}
          loading={isLoading}
        />
        <StatCard
          title="Faturamento (Mês Atual)"
          value={fmtBRL(thisMonthRevenue)}
          sub={thisMonthName}
          loading={isLoading}
        />
        <StatCard
          title="Entregues"
          value={String(delivered)}
          loading={isLoading}
        />
      </div>

      {/* ── Row 2: My recent orders ── */}
      <RecentOrdersTable
        orders={recentOrders}
        loading={isLoading}
        emptyText="Nenhum pedido encontrado. Inicie uma nova venda em Vendas."
      />
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isAdmin } = useFirebase();

  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA;
  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE;
  const buildMsg = process.env.NEXT_PUBLIC_BUILD_MSG;
  const buildDateFmt = buildDate
    ? new Date(buildDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-2xl font-bold">Dashboard</h1>
        {buildSha && (
          <span className="text-xs text-muted-foreground font-mono" title={buildMsg || undefined}>
            Build {buildSha} {buildDateFmt ? `\u00b7 ${buildDateFmt}` : ''}
          </span>
        )}
      </div>
      {isAdmin ? <AdminDashboard /> : <UserDashboard />}
    </div>
  );
}
