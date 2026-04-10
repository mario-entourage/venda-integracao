'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, Search } from 'lucide-react';
import { writeBatch } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import {
  getOrdersQuery,
  getOrderRef,
  getOrderSubcollectionDocs,
  updateOrder,
  updateOrderStatus,
} from '@/services/orders.service';
import type { OrderCustomer } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { TablePagination } from '@/components/shared/table-pagination';
import { exportToCsv } from '@/lib/export-csv';
import { IN_PROGRESS_STATUSES, isReadyToShip } from '@/lib/order-status-helpers';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { OrderStatus } from '@/types/enums';
import { PedidoRow } from '@/components/pedidos/pedido-row';
import type { Order } from '@/types';

// ---------------------------------------------------------------------------
// Status filter options
// ---------------------------------------------------------------------------

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos em andamento' },
  { value: 'pronto', label: 'Pronto p/ envio' },
  ...IN_PROGRESS_STATUSES.map((s) => ({
    value: s,
    label: ORDER_STATUS_LABELS[s as OrderStatus] ?? s,
  })),
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PedidosPage() {
  const router = useRouter();
  const { firestore, user, isAdmin } = useFirebase();
  const { toast } = useToast();

  // ── filter & sort & local hide state ───────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOption, setSortOption] = useState('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [shippedIds, setShippedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);

  // ── selection state (admin batch ops) ──────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // ── data ───────────────────────────────────────────────────────────────
  const ordersQuery = useMemoFirebase(
    () => (firestore ? getOrdersQuery(firestore) : null),
    [firestore],
  );

  const { data: orders, isLoading } = useCollection<Order>(ordersQuery);

  // ── customer name cache for alphabetical sorting ──────────────────────
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!firestore || !orders || orders.length === 0) return;
    let cancelled = false;

    async function fetchNames() {
      const map: Record<string, string> = {};
      await Promise.all(
        orders!.map(async (o) => {
          try {
            const customers = await getOrderSubcollectionDocs<OrderCustomer>(firestore!, o.id, 'customer');
            if (customers[0]?.name) map[o.id] = customers[0].name;
          } catch { /* ignore */ }
        }),
      );
      if (!cancelled) setCustomerNames(map);
    }

    fetchNames();
    return () => { cancelled = true; };
  }, [firestore, orders]);

  const filteredOrders = useMemo(() => {
    let result = (orders ?? []).filter(
      (o) =>
        !o.softDeleted &&
        !shippedIds.has(o.id) &&
        IN_PROGRESS_STATUSES.includes(o.status as OrderStatus),
    );
    if (statusFilter === 'pronto') {
      result = result.filter((o) => isReadyToShip(o));
    } else if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }
    return result;
  }, [orders, statusFilter, shippedIds]);

  const searchedOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredOrders;
    return filteredOrders.filter((o) => {
      const idMatch = o.id.toLowerCase().includes(q);
      const invoiceMatch = (o.invoice ?? '').toLowerCase().includes(q);
      const nameMatch = (customerNames[o.id] ?? '').toLowerCase().includes(q);
      return idMatch || invoiceMatch || nameMatch;
    });
  }, [filteredOrders, searchQuery, customerNames]);

  const sortedOrders = useMemo(() => {
    const list = [...searchedOrders];
    switch (sortOption) {
      case 'alpha-asc':
        return list.sort((a, b) =>
          (customerNames[a.id] ?? '').localeCompare(customerNames[b.id] ?? '', 'pt-BR', { sensitivity: 'base' }),
        );
      case 'price-desc':
        return list.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
      case 'price-asc':
        return list.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
      default:
        return list;
    }
  }, [searchedOrders, sortOption, customerNames]);

  const paginatedOrders = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [sortedOrders, currentPage, pageSize]);

  // Reset page when filter or sort changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setCurrentPage(0), [statusFilter, sortOption, searchQuery]);

  const handleExportCsv = () => {
    exportToCsv(filteredOrders, [
      { key: 'id', header: 'ID', render: (o) => o.id.slice(0, 8).toUpperCase() },
      { key: 'status', header: 'Status', render: (o) => ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status },
      { key: 'amount', header: 'Valor', render: (o) => String(o.amount ?? 0) },
      { key: 'currency', header: 'Moeda' },
      { key: 'createdAt', header: 'Data', render: (o) => {
        const ts = o.createdAt as unknown as { seconds: number } | null;
        return ts ? new Date(ts.seconds * 1000).toLocaleDateString('pt-BR') : '';
      } },
    ], 'pedidos');
  };

  // ── callbacks ──────────────────────────────────────────────────────────
  const handleShipped = (orderId: string) => {
    setShippedIds((prev) => new Set([...prev, orderId]));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  // ── soft-delete (single) ──────────────────────────────────────────────
  const handleSoftDelete = useCallback(
    async (order: Order) => {
      if (!firestore || !user) return;
      setIsDeleting(true);
      try {
        await updateOrder(firestore, order.id, {
          softDeleted: true,
          updatedById: user.uid,
        }, user.uid);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(order.id);
          return next;
        });
        toast({
          title: 'Pedido excluido',
          description: `Pedido #${order.id.slice(0, 8).toUpperCase()} movido para a lixeira.`,
        });
      } catch (err) {
        console.error('[PedidosPage] soft-delete error:', err);
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Nao foi possivel excluir o pedido.',
        });
      } finally {
        setIsDeleting(false);
        setDeleteTarget(null);
      }
    },
    [firestore, user, toast],
  );

  // ── cancel order ──────────────────────────────────────────────────────
  const handleCancelOrder = useCallback(
    async (order: Order) => {
      if (!firestore || !user) return;
      setIsCancelling(true);
      try {
        await updateOrderStatus(firestore, order.id, 'cancelled', user.uid);
        toast({
          title: 'Pedido cancelado',
          description: `Pedido #${order.id.slice(0, 8).toUpperCase()} foi cancelado.`,
        });
      } catch (err) {
        console.error('[PedidosPage] cancel error:', err);
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Nao foi possivel cancelar o pedido.',
        });
      } finally {
        setIsCancelling(false);
        setCancelTarget(null);
      }
    },
    [firestore, user, toast],
  );

  // ── batch delete ──────────────────────────────────────────────────────
  const handleBatchDelete = useCallback(async () => {
    if (!firestore || !user || selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(firestore);
      for (const id of selectedIds) {
        const ref = getOrderRef(firestore, id);
        batch.update(ref, { softDeleted: true, updatedById: user.uid });
      }
      await batch.commit();
      toast({
        title: 'Pedidos excluidos',
        description: `${selectedIds.size} pedido(s) movido(s) para a lixeira.`,
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error('[PedidosPage] batch-delete error:', err);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Nao foi possivel excluir os pedidos.',
      });
    } finally {
      setIsDeleting(false);
      setShowBatchDeleteDialog(false);
    }
  }, [firestore, user, selectedIds, toast]);

  // ── loading skeleton ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 rounded bg-muted animate-pulse" />
          <div className="h-10 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── empty state ───────────────────────────────────────────────────────
  if (filteredOrders.length === 0 && statusFilter === 'all') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-headline text-2xl font-bold">Pedidos</h1>
        </div>
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
          <p className="text-sm font-medium text-muted-foreground">Nenhum pedido em andamento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie uma nova venda para iniciar um pedido.
          </p>
          <Button className="mt-4" onClick={() => router.push('/remessas')}>
            + Nova Venda
          </Button>
        </div>
      </div>
    );
  }

  // ── main render ───────────────────────────────────────────────────────
  const allSelected = selectedIds.size === filteredOrders.length && filteredOrders.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Header with filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-headline text-2xl font-bold">Pedidos</h1>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortOption} onValueChange={setSortOption}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Ordenar por</SelectItem>
                <SelectItem value="alpha-asc">Alfabética (A → Z)</SelectItem>
                <SelectItem value="price-desc">Preço (Maior → Menor)</SelectItem>
                <SelectItem value="price-asc">Preço (Menor → Maior)</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar pedido..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[200px] pl-8 h-9"
              />
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isAdmin && (
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="Selecionar todos os pedidos"
              />
            )}
            <span className="text-sm text-muted-foreground">
              {filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}
            </span>
          </div>

          {isAdmin && selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5"
              onClick={() => setShowBatchDeleteDialog(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir ({selectedIds.size})</span>
            </Button>
          )}
        </div>

        {/* Order rows */}
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 px-6 py-16 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Nenhum pedido com esse status
            </p>
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="text-xs text-primary underline hover:text-primary/80"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {paginatedOrders.map((order) => (
                <PedidoRow
                  key={order.id}
                  order={order}
                  isAdmin={isAdmin}
                  isSelected={selectedIds.has(order.id)}
                  onToggleSelect={() => toggleSelect(order.id)}
                  onDeleteRequest={() => setDeleteTarget(order)}
                  onCancelRequest={() => setCancelTarget(order)}
                  onShipped={handleShipped}
                />
              ))}
            </div>
            <TablePagination
              totalItems={filteredOrders.length}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemLabel="pedidos"
              onExport={handleExportCsv}
            />
          </>
        )}
      </div>

      {/* Single-delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido{' '}
              <strong>#{deleteTarget?.id.slice(0, 8).toUpperCase()}</strong> sera
              movido para a lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={() => deleteTarget && handleSoftDelete(deleteTarget)}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel order confirmation dialog */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido{' '}
              <strong>#{cancelTarget?.id.slice(0, 8).toUpperCase()}</strong> sera
              marcado como cancelado. Esta acao nao pode ser desfeita facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isCancelling}
              onClick={() => cancelTarget && handleCancelOrder(cancelTarget)}
            >
              {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar Pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch-delete confirmation dialog */}
      <AlertDialog
        open={showBatchDeleteDialog}
        onOpenChange={(open) => {
          if (!open) setShowBatchDeleteDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} pedido(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Os pedidos selecionados serao movidos para a lixeira. Esta acao pode
              ser revertida por um administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleBatchDelete}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir {selectedIds.size} pedido(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
