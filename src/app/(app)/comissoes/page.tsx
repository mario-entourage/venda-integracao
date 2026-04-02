'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, RefreshCw, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useFirebase } from '@/firebase/provider';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { getDefaultPayPeriod } from '@/lib/commission';
import type { CommissionResponse, TierBreakdown } from '@/lib/commission';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;

const fmtDateISO = (d: Date) => d.toISOString().slice(0, 10);

const fmtDateBR = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR');
};

// ── Status options ───────────────────────────────────────────────────────────

const ALL_STATUSES = [
  { value: 'pending', label: 'Pendente' },
  { value: 'processing', label: 'Em andamento' },
  { value: 'awaiting_documents', label: 'Aguard. docs' },
  { value: 'documents_complete', label: 'Docs OK' },
  { value: 'awaiting_payment', label: 'Aguard. pagto' },
  { value: 'paid', label: 'Pago' },
  { value: 'shipped', label: 'Enviado' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelado' },
] as const;

const DEFAULT_CHECKED = new Set(['paid', 'shipped', 'delivered']);

// ── Component ────────────────────────────────────────────────────────────────

export default function ComissoesPage() {
  const router = useRouter();
  const { isAdmin, isAdminLoading } = useFirebase();
  const authFetch = useAuthFetch();

  // Redirect non-admins
  useEffect(() => {
    if (!isAdminLoading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isAdmin, isAdminLoading, router]);

  // ── Filter state ────────────────────────────────────────────────────────
  const defaultPeriod = getDefaultPayPeriod();
  const [startDate, setStartDate] = useState(fmtDateISO(defaultPeriod.start));
  const [endDate, setEndDate] = useState(fmtDateISO(defaultPeriod.end));
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(DEFAULT_CHECKED));

  // ── Data state ──────────────────────────────────────────────────────────
  const [data, setData] = useState<CommissionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Expanded tier rows ──────────────────────────────────────────────────
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  const toggleExpand = (userId: string) => {
    setExpandedReps((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start: new Date(startDate + 'T00:00:00').toISOString(),
        end: new Date(endDate + 'T23:59:59.999').toISOString(),
        statuses: Array.from(selectedStatuses).join(','),
      });
      const res = await authFetch(`/api/admin/commissions?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: CommissionResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [authFetch, startDate, endDate, selectedStatuses]);

  // Initial fetch
  useEffect(() => {
    if (isAdmin) {
      fetchCommissions();
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status toggle ───────────────────────────────────────────────────────
  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  if (isAdminLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Comissões"
        description="Comissão por representante no período selecionado"
      />

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start-date">Início</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-date">Fim</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex flex-wrap gap-3">
                {ALL_STATUSES.map((s) => (
                  <label key={s.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={selectedStatuses.has(s.value)}
                      onCheckedChange={() => toggleStatus(s.value)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={fetchCommissions} disabled={loading || selectedStatuses.size === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Erro ao carregar comissões: {error}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && !data && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {data && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Vendas Brutas"
              value={fmtBRL(data.totals.grossSales)}
              icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
            />
            <SummaryCard
              label="Comissão Total"
              value={fmtBRL(data.totals.commission)}
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
            />
            <SummaryCard
              label="Pedidos"
              value={String(data.totals.orderCount)}
              icon={<ClipboardIcon className="h-5 w-5 text-muted-foreground" />}
            />
          </div>

          {/* Period info */}
          <p className="text-sm text-muted-foreground">
            Período: {fmtDateBR(data.period.start.slice(0, 10))} — {fmtDateBR(data.period.end.slice(0, 10))}
            {' · '}Status: {data.statuses.map((s) => ALL_STATUSES.find((x) => x.value === s)?.label || s).join(', ')}
          </p>

          {/* Commission table */}
          {data.reps.length === 0 ? (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              Nenhum pedido encontrado para este período.
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Representante</TableHead>
                      <TableHead className="text-right">Vendas Brutas</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.reps.map((rep) => (
                      <RepRow
                        key={rep.userId}
                        rep={rep}
                        expanded={expandedReps.has(rep.userId)}
                        onToggle={() => toggleExpand(rep.userId)}
                      />
                    ))}
                    {/* Totals row */}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell />
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{fmtBRL(data.totals.grossSales)}</TableCell>
                      <TableCell className="text-right">{data.totals.orderCount}</TableCell>
                      <TableCell className="text-right">{fmtBRL(data.totals.commission)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        {icon}
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function RepRow({
  rep,
  expanded,
  onToggle,
}: {
  rep: CommissionResponse['reps'][number];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <TableCell className="w-8 px-2">
          {rep.tiers.length > 0 ? (
            expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : null}
        </TableCell>
        <TableCell className="font-medium">{rep.name}</TableCell>
        <TableCell className="text-right">{fmtBRL(rep.grossSales)}</TableCell>
        <TableCell className="text-right">{rep.orderCount}</TableCell>
        <TableCell className="text-right font-semibold">{fmtBRL(rep.commission)}</TableCell>
      </TableRow>
      {expanded && rep.tiers.length > 0 && (
        <TableRow className="bg-muted/20">
          <TableCell />
          <TableCell colSpan={4} className="p-0">
            <TierBreakdownTable tiers={rep.tiers} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function TierBreakdownTable({ tiers }: { tiers: TierBreakdown[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1.5 pl-4 text-left font-normal">Faixa</th>
          <th className="py-1.5 text-right font-normal">Taxa</th>
          <th className="py-1.5 text-right font-normal">Vendas na Faixa</th>
          <th className="py-1.5 pr-4 text-right font-normal">Comissão</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((tier, i) => (
          <tr key={i} className="border-t border-muted">
            <td className="py-1.5 pl-4">{tier.range}</td>
            <td className="py-1.5 text-right">{fmtPct(tier.rate)}</td>
            <td className="py-1.5 text-right">{fmtBRL(tier.sales)}</td>
            <td className="py-1.5 pr-4 text-right">{fmtBRL(tier.commission)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
