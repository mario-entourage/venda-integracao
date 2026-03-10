'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getAllPaymentLinksQuery } from '@/services/payments.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { PaymentLink } from '@/types';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  created: { label: 'Pendente', variant: 'outline' },
  paid: { label: 'Pago', variant: 'default' },
  expired: { label: 'Expirado', variant: 'secondary' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  failed: { label: 'Falhou', variant: 'destructive' },
  rejected: { label: 'Rejeitado', variant: 'destructive' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL',
  }).format(amount);
}

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const d = typeof (ts as { toDate?: () => Date }).toDate === 'function'
    ? (ts as { toDate: () => Date }).toDate()
    : new Date(ts as string);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PagamentosPage() {
  const { firestore } = useFirebase();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const paymentLinksQ = useMemoFirebase(
    () => (firestore ? getAllPaymentLinksQuery(firestore) : null),
    [firestore],
  );
  const { data: paymentLinks, isLoading } = useCollection<PaymentLink>(paymentLinksQ);

  // Apply filters
  const filtered = useMemo(() => {
    let items = paymentLinks ?? [];
    if (statusFilter !== 'all') {
      items = items.filter((pl) => pl.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((pl) =>
        (pl.invoice ?? '').toLowerCase().includes(q) ||
        (pl.repName ?? '').toLowerCase().includes(q) ||
        (pl.clientName ?? '').toLowerCase().includes(q) ||
        (pl.doctorName ?? '').toLowerCase().includes(q) ||
        pl.orderId.toLowerCase().includes(q),
      );
    }
    return items;
  }, [paymentLinks, statusFilter, search]);

  // Summary stats
  const total = paymentLinks?.length ?? 0;
  const pending = paymentLinks?.filter((p) => p.status === 'created').length ?? 0;
  const paid = paymentLinks?.filter((p) => p.status === 'paid').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Pagamentos" description="Links de pagamento GlobalPay" />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-yellow-600">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pagos</p>
            <p className="text-2xl font-bold text-green-600">{paid}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar por invoice, rep, cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="created">Pendente</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Representante</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum link de pagamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((pl) => (
                    <TableRow
                      key={pl.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/controle/${pl.orderId}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        {pl.invoice || pl.orderId.slice(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {fmtAmount(pl.amount, pl.currency)}
                      </TableCell>
                      <TableCell>{pl.clientName || '—'}</TableCell>
                      <TableCell>{pl.repName || '—'}</TableCell>
                      <TableCell className="text-sm">{fmtDate(pl.createdAt)}</TableCell>
                      <TableCell><StatusBadge status={pl.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
