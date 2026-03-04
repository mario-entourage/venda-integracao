'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, MoreHorizontal } from 'lucide-react';
import { writeBatch } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getOrdersQuery, getOrderRef, updateOrder } from '@/services/orders.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getGranularStatus, EXTENDED_STATUS_CONFIG, IN_PROGRESS_STATUSES } from '@/lib/order-status-helpers';
import { OrderStatus } from '@/types/enums';
import type { Order } from '@/types';

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
  const { firestore, user, isAdmin } = useFirebase();
  const { toast } = useToast();

  // ── selection state ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── data ────────────────────────────────────────────────────────────────────
  const ordersQ = useMemoFirebase(
    () => (firestore ? getOrdersQuery(firestore) : null),
    [firestore],
  );

  const { data: orders, isLoading } = useCollection<Order>(ordersQ);

  // Only show in-progress orders (exclude shipped, delivered, cancelled, soft-deleted)
  const activeOrders = (orders ?? []).filter(
    (o) => !o.softDeleted && IN_PROGRESS_STATUSES.includes(o.status as OrderStatus),
  );

  // ── selection helpers ───────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === activeOrders.length && activeOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeOrders.map((o) => o.id)));
    }
  };

  // ── soft-delete (single) ────────────────────────────────────────────────────
  const handleSoftDelete = useCallback(
    async (order: Order) => {
      if (!firestore || !user) return;
      setIsDeleting(true);
      try {
        await updateOrder(firestore, order.id, {
          softDeleted: true,
          updatedById: user.uid,
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(order.id);
          return next;
        });
        toast({
          title: 'Venda excluída',
          description: `Pedido #${order.id.slice(0, 8).toUpperCase()} movido para a lixeira.`,
        });
      } catch (err) {
        console.error('[VendasEmAndamento] soft-delete error:', err);
        toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível excluir a venda.' });
      } finally {
        setIsDeleting(false);
        setDeleteTarget(null);
      }
    },
    [firestore, user, toast],
  );

  // ── soft-delete (batch) ─────────────────────────────────────────────────────
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
        title: 'Vendas excluídas',
        description: `${selectedIds.size} venda(s) movida(s) para a lixeira.`,
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error('[VendasEmAndamento] batch-delete error:', err);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível excluir as vendas.' });
    } finally {
      setIsDeleting(false);
      setShowBatchDeleteDialog(false);
    }
  }, [firestore, user, selectedIds, toast]);

  // ── loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // ── empty state ─────────────────────────────────────────────────────────────
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
          Clique em &ldquo;Nova venda&rdquo; para iniciar um pedido.
        </p>
        <Button className="mt-4" onClick={onNewVenda}>
          + Nova venda
        </Button>
      </div>
    );
  }

  // ── order list ──────────────────────────────────────────────────────────────
  const allSelected = selectedIds.size === activeOrders.length;

  return (
    <>
      {/* ── Action bar ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Selecionar todos os pedidos"
            />
          )}
          <span className="text-sm text-muted-foreground">
            {activeOrders.length} pedido(s)
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

      {/* ── Rows ── */}
      <div className="space-y-2">
        {activeOrders.map((order) => {
          const granular = getGranularStatus(order);
          const statusCfg = EXTENDED_STATUS_CONFIG[granular.configKey] ?? EXTENDED_STATUS_CONFIG.pending;
          const isSelected = selectedIds.has(order.id);

          return (
            <div
              key={order.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border bg-card px-4 py-3 transition-colors',
                isSelected && 'bg-muted/50',
              )}
            >
              {/* Checkbox (admin only) */}
              {isAdmin && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(order.id)}
                  aria-label={`Selecionar pedido ${order.id.slice(0, 8).toUpperCase()}`}
                  className="flex-shrink-0"
                />
              )}

              {/* Clickable area → navigate to detail */}
              <button
                type="button"
                className="flex flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-w-0"
                onClick={() => router.push(`/controle/${order.id}`)}
              >
                {/* Order ID */}
                <div className="flex-shrink-0 w-20">
                  <p className="text-xs font-mono text-muted-foreground">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>

                {/* Status */}
                <div className="flex-shrink-0 w-36">
                  <Badge variant="outline" className={cn('text-xs', statusCfg.className)}>
                    {granular.label}
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
              </button>

              {/* Per-row actions (admin only) */}
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 flex-shrink-0"
                      aria-label="Ações do pedido"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Ações</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => router.push(`/controle/${order.id}`)}>
                      Ver detalhes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(order)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Single-delete confirmation dialog ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido{' '}
              <strong>#{deleteTarget?.id.slice(0, 8).toUpperCase()}</strong> será
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

      {/* ── Batch-delete confirmation dialog ── */}
      <AlertDialog
        open={showBatchDeleteDialog}
        onOpenChange={(open) => { if (!open) setShowBatchDeleteDialog(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} venda(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              As vendas selecionadas serão movidas para a lixeira. Esta ação pode
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
              Excluir {selectedIds.size} venda(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
