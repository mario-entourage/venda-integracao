'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { collection, collectionGroup, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrdersQuery, getOrdersByCreatorQuery } from '@/services/orders.service';
import { getUsersRef } from '@/services/users.service';
import { OrderStatus } from '@/types/enums';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDashboardLang } from '@/contexts/dashboard-lang-context';
import type { Order } from '@/types';
import type { Prescription } from '@/types/prescription';
import type { Payment } from '@/types/payment';
import type { ShippingRecord } from '@/types/shipping';

// ─── translations ────────────────────────────────────────────────────────────

type Lang = 'pt' | 'en';

const translations = {
  pt: {
    dashboard: 'Dashboard',
    revenueCurrentMonth: 'Faturamento (Mês Atual)',
    revenuePreviousMonth: 'Faturamento (Mês Anterior)',
    pendingOrders: 'Pedidos Pendentes',
    activeUsers: 'Usuários Ativos',
    activeOrders: 'Pedidos Ativos',
    awaitingPayment: 'Aguardando Pagamento',
    delivered: 'Entregues',
    ordersByStatus: 'Pedidos por Status',
    recentOrders: 'Pedidos Recentes',
    thId: 'ID',
    thStatus: 'Status',
    thValue: 'Valor',
    thDate: 'Data',
    emptyOrders: 'Nenhum pedido encontrado.',
    emptyOrdersUser: 'Nenhum pedido encontrado. Inicie uma nova venda em Vendas.',
    statusPending: 'Pendente',
    statusProcessing: 'Em andamento',
    statusAwaitingDocs: 'Aguard. docs',
    statusDocsComplete: 'Docs OK',
    statusAwaitingPayment: 'Aguard. pagto',
    statusPaid: 'Pago',
    statusShipped: 'Enviado',
    statusDelivered: 'Entregue',
    statusCancelled: 'Cancelado',
  },
  en: {
    dashboard: 'Dashboard',
    revenueCurrentMonth: 'Revenue (Current Month)',
    revenuePreviousMonth: 'Revenue (Previous Month)',
    pendingOrders: 'Pending Orders',
    activeUsers: 'Active Users',
    activeOrders: 'Active Orders',
    awaitingPayment: 'Awaiting Payment',
    delivered: 'Delivered',
    ordersByStatus: 'Orders by Status',
    recentOrders: 'Recent Orders',
    thId: 'ID',
    thStatus: 'Status',
    thValue: 'Amount',
    thDate: 'Date',
    emptyOrders: 'No orders found.',
    emptyOrdersUser: 'No orders found. Start a new sale in Sales.',
    statusPending: 'Pending',
    statusProcessing: 'Processing',
    statusAwaitingDocs: 'Awaiting Docs',
    statusDocsComplete: 'Docs OK',
    statusAwaitingPayment: 'Awaiting Payment',
    statusPaid: 'Paid',
    statusShipped: 'Shipped',
    statusDelivered: 'Delivered',
    statusCancelled: 'Cancelled',
  },
} as const;

type Translations = typeof translations[Lang];

function getStatusConfig(t: Translations): Record<string, { label: string; className: string }> {
  return {
    pending:            { label: t.statusPending,         className: 'border-slate-300 text-slate-600 bg-slate-50' },
    processing:         { label: t.statusProcessing,      className: 'border-blue-300 text-blue-700 bg-blue-50' },
    awaiting_documents: { label: t.statusAwaitingDocs,    className: 'border-amber-300 text-amber-700 bg-amber-50' },
    documents_complete: { label: t.statusDocsComplete,    className: 'border-teal-300 text-teal-700 bg-teal-50' },
    awaiting_payment:   { label: t.statusAwaitingPayment, className: 'border-orange-300 text-orange-700 bg-orange-50' },
    paid:               { label: t.statusPaid,            className: 'border-green-300 text-green-700 bg-green-50' },
    shipped:            { label: t.statusShipped,         className: 'border-purple-300 text-purple-700 bg-purple-50' },
    delivered:          { label: t.statusDelivered,       className: 'border-green-400 text-green-800 bg-green-100' },
    cancelled:          { label: t.statusCancelled,       className: 'border-red-300 text-red-600 bg-red-50' },
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (ts: unknown, lang: Lang = 'pt') => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR');
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
  emptyText,
  t,
  lang,
}: {
  orders: Order[];
  loading: boolean;
  emptyText?: string;
  t: Translations;
  lang: Lang;
}) {
  const statusConfig = useMemo(() => getStatusConfig(t), [t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.recentOrders}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="space-y-2 px-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">{emptyText ?? t.emptyOrders}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pl-6 text-left font-medium text-muted-foreground w-28">{t.thId}</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">{t.thStatus}</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground w-32">{t.thValue}</th>
                  <th className="pb-2 pr-6 text-right font-medium text-muted-foreground w-28">{t.thDate}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const cfg = statusConfig[order.status] ?? statusConfig.pending;
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
                        {fmtDate(order.createdAt, lang)}
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

function AdminDashboard({ t, lang }: { t: Translations; lang: Lang }) {
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
  // Only load data from start of last month onward (dashboard only shows this + last month)
  const dateFloor = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1, 1);
    d.setHours(0, 0, 0, 0);
    return Timestamp.fromDate(d);
  }, []);

  // Prescriptions (top-level collection — filtered to recent)
  const prescriptionsQ = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'prescriptions'), where('createdAt', '>=', dateFloor), orderBy('createdAt', 'desc'), limit(200)) : null),
    [firestore, dateFloor],
  );
  const { data: allPrescriptions, isLoading: prescriptionsLoading } =
    useCollection<Prescription>(prescriptionsQ);

  // Payments (subcollection group — filtered to recent)
  const paymentsGroupQ = useMemoFirebase(
    () => (firestore ? query(collectionGroup(firestore, 'payments'), where('createdAt', '>=', dateFloor), orderBy('createdAt', 'desc'), limit(200)) : null),
    [firestore, dateFloor],
  );
  const { data: allPayments, isLoading: paymentsLoading } =
    useCollection<Payment>(paymentsGroupQ);

  // Shipping records (subcollection group — filtered to recent)
  const shippingGroupQ = useMemoFirebase(
    () => (firestore ? query(collectionGroup(firestore, 'shipping'), where('createdAt', '>=', dateFloor), orderBy('createdAt', 'desc'), limit(200)) : null),
    [firestore, dateFloor],
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

  const locale = lang === 'en' ? 'en-US' : 'pt-BR';
  const now = new Date();
  const thisMonthName = now.toLocaleString(locale, { month: 'long', year: 'numeric' });
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthName = lastMonthDate.toLocaleString(locale, { month: 'long', year: 'numeric' });

  // Combined loading state for the status section
  const statusSectionLoading = ordersLoading || prescriptionsLoading || paymentsLoading || shippingLoading;

  const statusConfig = useMemo(() => getStatusConfig(t), [t]);

  // Only show statuses that have at least one order
  const visibleStatuses = Object.entries(statusConfig).filter(
    ([status]) => (statusCounts[status] ?? 0) > 0,
  );

  return (
    <div className="space-y-6">

      {/* ── Row 1: Key metrics ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t.revenueCurrentMonth}
          value={fmtBRL(thisMonthRevenue)}
          sub={thisMonthName}
          loading={ordersLoading}
        />
        <StatCard
          title={t.revenuePreviousMonth}
          value={fmtBRL(lastMonthRevenue)}
          sub={lastMonthName}
          loading={ordersLoading}
        />
        <StatCard
          title={t.pendingOrders}
          value={String(pendingCount)}
          loading={ordersLoading}
        />
        <StatCard
          title={t.activeUsers}
          value={String(activeUsers?.length ?? 0)}
          loading={usersLoading}
        />
      </div>

      {/* ── Row 2: Orders by status (current month only, non-empty statuses) ── */}
      {(statusSectionLoading || visibleStatuses.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.ordersByStatus}</CardTitle>
          </CardHeader>
          <CardContent>
            {statusSectionLoading ? (
              <div className="grid gap-2 grid-cols-3 sm:grid-cols-5 lg:grid-cols-9">
                {Object.entries(statusConfig).map(([status, cfg]) => (
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
      <RecentOrdersTable orders={recentOrders} loading={ordersLoading} t={t} lang={lang} />
    </div>
  );
}

// ─── user dashboard ───────────────────────────────────────────────────────────

function UserDashboard({ t, lang }: { t: Translations; lang: Lang }) {
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

  const locale = lang === 'en' ? 'en-US' : 'pt-BR';
  const now = new Date();
  const thisMonthName = now.toLocaleString(locale, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">

      {/* ── Row 1: My metrics ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t.activeOrders}
          value={String(activeOrders.length)}
          loading={isLoading}
        />
        <StatCard
          title={t.awaitingPayment}
          value={String(awaitingPayment)}
          loading={isLoading}
        />
        <StatCard
          title={t.revenueCurrentMonth}
          value={fmtBRL(thisMonthRevenue)}
          sub={thisMonthName}
          loading={isLoading}
        />
        <StatCard
          title={t.delivered}
          value={String(delivered)}
          loading={isLoading}
        />
      </div>

      {/* ── Row 2: My recent orders ── */}
      <RecentOrdersTable
        orders={recentOrders}
        loading={isLoading}
        emptyText={t.emptyOrdersUser}
        t={t}
        lang={lang}
      />
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isAdmin } = useFirebase();
  const ctx = useDashboardLang();
  const lang: Lang = ctx?.lang ?? 'pt';
  const t = translations[lang];

  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA;
  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE;
  const buildMsg = process.env.NEXT_PUBLIC_BUILD_MSG;
  const locale = lang === 'en' ? 'en-US' : 'pt-BR';
  const buildDateFmt = buildDate
    ? new Date(buildDate).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-2xl font-bold">{t.dashboard}</h1>
        {buildSha && (
          <span className="text-xs text-muted-foreground font-mono" title={buildMsg || undefined}>
            Build {buildSha} {buildDateFmt ? `\u00b7 ${buildDateFmt}` : ''}
          </span>
        )}
      </div>
      {isAdmin ? <AdminDashboard t={t} lang={lang} /> : <UserDashboard t={t} lang={lang} />}
    </div>
  );
}
