'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, Plus, Link2, MoreHorizontal, Trash2, Eye, Pencil, CheckCircle2, ExternalLink, Copy,
} from 'lucide-react';
import { friendlyError } from '@/lib/friendly-error';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useCollection } from '@/firebase';
import { getAllPaymentLinksQuery } from '@/services/payments.service';
import { getActiveRepUsersQuery } from '@/services/users.service';
import { generateStandalonePaymentLink, assignPaymentToOrder } from '@/server/actions/payment.actions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { TablePagination } from '@/components/shared/table-pagination';
import { exportToCsv } from '@/lib/export-csv';
import type { PaymentLink, User } from '@/types';

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

function fmtDateTime(ts: unknown): string {
  if (!ts) return '—';
  const d = typeof (ts as { toDate?: () => Date }).toDate === 'function'
    ? (ts as { toDate: () => Date }).toDate()
    : new Date(ts as string);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PagamentosPage() {
  const { firestore, isAdmin } = useFirebase();
  const authFetch = useAuthFetch();
  const router = useRouter();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<{ time: string; approved: number; checked: number } | null>(null);

  // Create standalone payment dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createAmount, setCreateAmount] = useState('');
  const [createCurrency, setCreateCurrency] = useState('BRL');
  const [createCustomerName, setCreateCustomerName] = useState('');
  const [createCustomerPhone, setCreateCustomerPhone] = useState('');
  const [createCustomerEmail, setCreateCustomerEmail] = useState('');
  const [createCustomerDoc, setCreateCustomerDoc] = useState('');
  const [createRepId, setCreateRepId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdInvoice, setCreatedInvoice] = useState('');

  // Assign to order dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPaymentId, setAssignPaymentId] = useState('');
  const [assignOrderId, setAssignOrderId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Admin per-link actions
  const [viewLink, setViewLink] = useState<PaymentLink | null>(null);
  const [editLink, setEditLink] = useState<PaymentLink | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editRepName, setEditRepName] = useState('');
  const [editInvoice, setEditInvoice] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentLink | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // link id being verified

  // ── Sync all ──────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await authFetch('/api/payments/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSync({ time, approved: data.approved, checked: data.checked });
      if (data.approved > 0) {
        toast({ title: `${data.approved} pagamento(s) confirmado(s) e pedido(s) atualizado(s).` });
      } else {
        toast({ title: `Sincronizado — ${data.checked} link(s) verificado(s), nenhuma mudança.` });
      }
    } catch (err) {
      toast({ title: 'Erro ao sincronizar pagamentos.', description: friendlyError(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync on mount — runs once when the page first loads.
  // useRef guards against double-fire in React strict mode.
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (didAutoSync.current) return;
    didAutoSync.current = true;
    handleSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create standalone ─────────────────────────────────────────────────────

  const handleCreateStandalone = async () => {
    const amount = parseFloat(createAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Informe um valor válido.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const selectedRepName = createRepId && createRepId !== '__none'
        ? (repUsers ?? []).find((r) => r.id === createRepId)?.displayName || undefined
        : undefined;
      const result = await generateStandalonePaymentLink(
        amount,
        createCurrency,
        createCustomerName || undefined,
        createCustomerPhone || undefined,
        createCustomerEmail || undefined,
        createCustomerDoc || undefined,
        selectedRepName,
      );
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
      } else {
        setCreatedUrl(result.paymentUrl);
        setCreatedInvoice(result.invoiceNumber);
        toast({ title: `Link criado: ${result.invoiceNumber}` });
      }
    } catch (err) {
      toast({ title: 'Erro ao criar pagamento avulso.', description: friendlyError(err), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  // ── Assign ────────────────────────────────────────────────────────────────

  const handleAssign = async () => {
    if (!assignOrderId.trim()) {
      toast({ title: 'Informe o ID do pedido.', variant: 'destructive' });
      return;
    }
    setAssigning(true);
    try {
      const result = await assignPaymentToOrder(assignPaymentId, assignOrderId.trim());
      if (result.ok) {
        toast({ title: 'Pagamento vinculado ao pedido com sucesso.' });
        setAssignOpen(false);
        setAssignPaymentId('');
        setAssignOrderId('');
      } else {
        toast({ title: result.error || 'Erro ao vincular.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Erro ao vincular pagamento.', description: friendlyError(err), variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  // ── Verify single link ────────────────────────────────────────────────────

  const handleVerify = async (pl: PaymentLink) => {
    setActionLoading(pl.id);
    try {
      const res = await authFetch('/api/payments/verify-link', {
        method: 'POST',
        body: JSON.stringify({ linkId: pl.id, orderId: pl.orderId ?? '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
      if (data.approved) {
        toast({ title: 'Pagamento confirmado!', description: `Status atualizado para: Pago.` });
      } else if (data.terminal) {
        toast({ title: `Status atualizado: ${data.newStatus}` });
      } else {
        toast({ title: `GlobalPay confirma: ainda pendente (${data.globalPayStatus || 'sem status'}).` });
      }
    } catch (err) {
      toast({ title: 'Erro ao verificar link.', description: friendlyError(err), variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Edit metadata ─────────────────────────────────────────────────────────

  const openEdit = (pl: PaymentLink) => {
    setEditLink(pl);
    setEditClientName(pl.clientName ?? '');
    setEditRepName(pl.repName ?? '');
    setEditInvoice(pl.invoice ?? '');
  };

  const handleEditSave = async () => {
    if (!editLink) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/payments/update-link', {
        method: 'POST',
        body: JSON.stringify({
          linkId: editLink.id,
          orderId: editLink.orderId ?? '',
          clientName: editClientName,
          repName: editRepName,
          invoice: editInvoice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
      toast({ title: 'Metadados atualizados.' });
      setEditLink(null);
    } catch (err) {
      toast({ title: 'Erro ao salvar.', description: friendlyError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      const res = await authFetch('/api/payments/delete-link', {
        method: 'POST',
        body: JSON.stringify({ linkId: deleteTarget.id, orderId: deleteTarget.orderId ?? '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
      toast({ title: 'Link excluído.' });
      setDeleteTarget(null);
    } catch (err) {
      toast({ title: 'Erro ao excluir link.', description: friendlyError(err), variant: 'destructive' });
      setDeleteTarget(null);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const resetCreateDialog = () => {
    setCreateOpen(false);
    setCreateAmount('');
    setCreateCurrency('BRL');
    setCreateRepId('');
    setCreateCustomerName('');
    setCreateCustomerPhone('');
    setCreateCustomerEmail('');
    setCreateCustomerDoc('');
    setCreatedUrl('');
    setCreatedInvoice('');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado!` });
  };

  // ── Data ──────────────────────────────────────────────────────────────────

  const paymentLinksQ = useMemoFirebase(
    () => (firestore ? getAllPaymentLinksQuery(firestore) : null),
    [firestore],
  );
  const { data: paymentLinks, isLoading } = useCollection<PaymentLink>(paymentLinksQ);

  const repUsersQ = useMemoFirebase(
    () => (firestore && isAdmin ? getActiveRepUsersQuery(firestore) : null),
    [firestore, isAdmin],
  );
  const { data: repUsers } = useCollection<User>(repUsersQ);

  // Apply filters
  const filtered = useMemo(() => {
    let items = paymentLinks ?? [];
    if (statusFilter === 'unassigned') {
      items = items.filter((pl) => !pl.orderId);
    } else if (statusFilter !== 'all') {
      items = items.filter((pl) => pl.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((pl) =>
        (pl.invoice ?? '').toLowerCase().includes(q) ||
        (pl.repName ?? '').toLowerCase().includes(q) ||
        (pl.clientName ?? '').toLowerCase().includes(q) ||
        (pl.doctorName ?? '').toLowerCase().includes(q) ||
        (pl.orderId || '').toLowerCase().includes(q),
      );
    }
    return items;
  }, [paymentLinks, statusFilter, search]);

  // Paginate
  const paginatedItems = useMemo(() => {
    const start = currentPage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setCurrentPage(0), [statusFilter, search]);

  const handleExportCsv = () => {
    exportToCsv(filtered, [
      { key: 'invoice', header: 'Invoice' },
      { key: 'amount', header: 'Valor', render: (pl) => String(pl.amount) },
      { key: 'currency', header: 'Moeda' },
      { key: 'clientName', header: 'Cliente' },
      { key: 'repName', header: 'Representante' },
      { key: 'createdAt', header: 'Data', render: (pl) => fmtDate(pl.createdAt) },
      { key: 'status', header: 'Status', render: (pl) => STATUS_LABELS[pl.status]?.label ?? pl.status },
    ], 'pagamentos');
  };

  // Summary stats
  const total = paymentLinks?.length ?? 0;
  const pending = paymentLinks?.filter((p) => p.status === 'created').length ?? 0;
  const paid = paymentLinks?.filter((p) => p.status === 'paid').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Pagamentos" description="Links de pagamento GlobalPay" />
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="default" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Pagamento
              </Button>
            )}
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar GlobalPay'}
            </Button>
          </div>
          {lastSync && (
            <p className="text-xs text-muted-foreground">
              {lastSync.time} — {lastSync.checked} verificado(s), {lastSync.approved} aprovado(s)
            </p>
          )}
        </div>
      </div>

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
            {isAdmin && <SelectItem value="unassigned">Avulso</SelectItem>}
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
                  {isAdmin && <TableHead className="w-[48px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8">
                      <p className="text-muted-foreground">Nenhum link de pagamento encontrado.</p>
                      {(statusFilter !== 'all' || search.trim()) && (
                        <button
                          type="button"
                          onClick={() => { setStatusFilter('all'); setSearch(''); }}
                          className="mt-2 text-xs text-primary underline hover:text-primary/80"
                        >
                          Limpar filtros
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((pl) => {
                    const isUnassigned = !pl.orderId;
                    const isVerifying = actionLoading === pl.id;
                    return (
                      <TableRow
                        key={pl.id}
                        className={`hover:bg-muted/50 ${isUnassigned ? '' : 'cursor-pointer'}`}
                        onClick={() => {
                          if (!isUnassigned) router.push(`/controle/${pl.orderId}`);
                        }}
                      >
                        <TableCell className="font-mono text-xs">
                          <span className="flex items-center gap-2">
                            {pl.invoice || (pl.orderId ? pl.orderId.slice(0, 8).toUpperCase() : '—')}
                            {isUnassigned && (
                              <Badge variant="outline" className="border-orange-300 text-orange-600 bg-orange-50 text-[10px]">
                                Avulso
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {fmtAmount(pl.amount, pl.currency)}
                        </TableCell>
                        <TableCell>{pl.clientName || '—'}</TableCell>
                        <TableCell>{pl.repName || '—'}</TableCell>
                        <TableCell className="text-sm">{fmtDate(pl.createdAt)}</TableCell>
                        <TableCell><StatusBadge status={pl.status} /></TableCell>
                        {isAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isVerifying}>
                                  {isVerifying
                                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    : <MoreHorizontal className="h-3.5 w-3.5" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewLink(pl)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Ver detalhes
                                </DropdownMenuItem>
                                {pl.referenceId && (
                                  <DropdownMenuItem onClick={() => handleVerify(pl)}>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Verificar no GlobalPay
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => openEdit(pl)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Alterar metadados
                                </DropdownMenuItem>
                                {isUnassigned && pl.status === 'created' && (
                                  <DropdownMenuItem
                                    onClick={() => { setAssignPaymentId(pl.id); setAssignOpen(true); }}
                                  >
                                    <Link2 className="mr-2 h-4 w-4" />
                                    Vincular a pedido
                                  </DropdownMenuItem>
                                )}
                                {pl.status !== 'paid' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setDeleteTarget(pl)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Excluir
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
          {!isLoading && filtered.length > 0 && (
            <TablePagination
              totalItems={filtered.length}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemLabel="pagamentos"
              onExport={handleExportCsv}
            />
          )}
        </CardContent>
      </Card>

      {/* ── View Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!viewLink} onOpenChange={(open) => { if (!open) setViewLink(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Link</DialogTitle>
            <DialogDescription>{viewLink?.invoice || viewLink?.id}</DialogDescription>
          </DialogHeader>
          {viewLink && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge status={viewLink.status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-medium">{fmtAmount(viewLink.amount, viewLink.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p>{viewLink.clientName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Representante</p>
                  <p>{viewLink.repName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Médico</p>
                  <p>{viewLink.doctorName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pedido</p>
                  {viewLink.orderId
                    ? <button className="text-primary underline" onClick={() => { setViewLink(null); router.push(`/controle/${viewLink.orderId}`); }}>{viewLink.orderId.slice(0, 12)}…</button>
                    : <span className="text-orange-600">Avulso</span>
                  }
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Criado em</p>
                  <p>{fmtDateTime(viewLink.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expira em</p>
                  <p>{fmtDateTime(viewLink.expiresAt)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Referência GlobalPay</p>
                  <p className="font-mono text-xs break-all">{viewLink.referenceId || '—'}</p>
                </div>
              </div>
              {viewLink.paymentUrl && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">URL de Pagamento</p>
                  <div className="flex items-center gap-2">
                    <Input value={viewLink.paymentUrl} readOnly className="text-xs h-8" />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => copyToClipboard(viewLink.paymentUrl!, 'URL')}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                      <a href={viewLink.paymentUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewLink(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Metadata Dialog ───────────────────────────────────────── */}
      <Dialog open={!!editLink} onOpenChange={(open) => { if (!open) setEditLink(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Metadados</DialogTitle>
            <DialogDescription>
              Atualiza os campos de exibição do link. Valor e moeda não podem ser alterados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do Cliente</Label>
              <Input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Representante</Label>
              <Input value={editRepName} onChange={(e) => setEditRepName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Invoice / Referência</Label>
              <Input value={editInvoice} onChange={(e) => setEditInvoice(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLink(null)}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir link de pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O link <strong>{deleteTarget?.invoice || deleteTarget?.id}</strong> ({fmtAmount(deleteTarget?.amount ?? 0, deleteTarget?.currency ?? 'BRL')}) será excluído permanentemente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirmed}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Create Standalone Payment Dialog ──────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetCreateDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Pagamento Avulso</DialogTitle>
            <DialogDescription>
              Cria um link de pagamento GlobalPay sem vínculo com nenhum pedido. Invoice: ETGM#####
            </DialogDescription>
          </DialogHeader>

          {createdUrl ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-green-600">Link criado com sucesso!</p>
              <div className="space-y-1">
                <Label className="text-xs">Invoice</Label>
                <p className="font-mono text-sm">{createdInvoice}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL do Pagamento</Label>
                <div className="flex gap-2">
                  <Input value={createdUrl} readOnly className="text-xs" />
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(createdUrl); toast({ title: 'Link copiado!' }); }}>
                    Copiar
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetCreateDialog}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor *</Label>
                  <Input type="number" step="0.01" min="0.01" placeholder="0,00" value={createAmount} onChange={(e) => setCreateAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Moeda</Label>
                  <Select value={createCurrency} onValueChange={setCreateCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Representante</Label>
                <Select value={createRepId} onValueChange={setCreateRepId}>
                  <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Nenhum</SelectItem>
                    {(repUsers ?? []).map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>{rep.displayName || rep.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do Cliente</Label>
                <Input placeholder="Opcional" value={createCustomerName} onChange={(e) => setCreateCustomerName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefone</Label>
                  <Input placeholder="Opcional" value={createCustomerPhone} onChange={(e) => setCreateCustomerPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">E-mail</Label>
                  <Input placeholder="Opcional" value={createCustomerEmail} onChange={(e) => setCreateCustomerEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CPF / Documento</Label>
                <Input placeholder="Opcional" value={createCustomerDoc} onChange={(e) => setCreateCustomerDoc(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetCreateDialog}>Cancelar</Button>
                <Button onClick={handleCreateStandalone} disabled={creating}>
                  {creating ? 'Criando...' : 'Criar Link'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Assign to Order Dialog ────────────────────────────────────── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular Pagamento a Pedido</DialogTitle>
            <DialogDescription>
              Informe o ID do pedido para vincular este pagamento avulso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ID do Pedido</Label>
              <Input placeholder="Cole o ID do pedido aqui" value={assignOrderId} onChange={(e) => setAssignOrderId(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssign} disabled={assigning}>
              {assigning ? 'Vinculando...' : 'Vincular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
