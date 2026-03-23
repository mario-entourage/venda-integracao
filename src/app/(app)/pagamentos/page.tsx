'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Plus, Link2 } from 'lucide-react';
import { friendlyError } from '@/lib/friendly-error';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PagamentosPage() {
  const { firestore, isAdmin, user } = useFirebase();
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) { toast({ title: 'Sessão expirada. Recarregue.', variant: 'destructive' }); setSyncing(false); return; }
      const res = await fetchWithTimeout('/api/payments/sync', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
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
      toast({
        title: 'Erro ao sincronizar pagamentos.',
        description: friendlyError(err),
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

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
      toast({
        title: 'Erro ao criar pagamento avulso.',
        description: friendlyError(err),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

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
      toast({
        title: 'Erro ao vincular pagamento.',
        description: friendlyError(err),
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

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

  // Reset page when filters change
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
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={syncing}
            >
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
                  {isAdmin && <TableHead className="w-[100px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      Nenhum link de pagamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((pl) => {
                    const isUnassigned = !pl.orderId;
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
                          <TableCell>
                            {isUnassigned && pl.status === 'created' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignPaymentId(pl.id);
                                  setAssignOpen(true);
                                }}
                              >
                                <Link2 className="mr-1 h-3 w-3" />
                                Vincular
                              </Button>
                            )}
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

      {/* ── Create Standalone Payment Dialog ──────────────────────── */}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(createdUrl);
                      toast({ title: 'Link copiado!' });
                    }}
                  >
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
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={createAmount}
                    onChange={(e) => setCreateAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Moeda</Label>
                  <Select value={createCurrency} onValueChange={setCreateCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Nenhum</SelectItem>
                    {(repUsers ?? []).map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.displayName || rep.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do Cliente</Label>
                <Input
                  placeholder="Opcional"
                  value={createCustomerName}
                  onChange={(e) => setCreateCustomerName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefone</Label>
                  <Input
                    placeholder="Opcional"
                    value={createCustomerPhone}
                    onChange={(e) => setCreateCustomerPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">E-mail</Label>
                  <Input
                    placeholder="Opcional"
                    value={createCustomerEmail}
                    onChange={(e) => setCreateCustomerEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CPF / Documento</Label>
                <Input
                  placeholder="Opcional"
                  value={createCustomerDoc}
                  onChange={(e) => setCreateCustomerDoc(e.target.value)}
                />
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

      {/* ── Assign to Order Dialog ────────────────────────────────── */}
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
              <Input
                placeholder="Cole o ID do pedido aqui"
                value={assignOrderId}
                onChange={(e) => setAssignOrderId(e.target.value)}
              />
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
