'use client';

import { useState, useMemo } from 'react';
import { RefreshCw, Check, X, Plus, Pencil } from 'lucide-react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import {
  getStockProductsByStockQuery,
  createStockProduct,
  updateStockQuantity,
} from '@/services/products.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import type { Product, StockProduct } from '@/types/product';

// ─── types ───────────────────────────────────────────────────────────────────

type ProductWithId = Product & { id: string };

interface StockLocationViewProps {
  stockId: string;
  products: ProductWithId[];
  productsLoading: boolean;
  showTristarSync?: boolean;
}

// ─── joined row type ─────────────────────────────────────────────────────────

interface JoinedRow {
  product: ProductWithId;
  stockProduct: (StockProduct & { id: string }) | null;
  quantity: number;
}

// ─── component ───────────────────────────────────────────────────────────────

export function StockLocationView({
  stockId,
  products,
  productsLoading,
  showTristarSync,
}: StockLocationViewProps) {
  const db = useFirestore();
  const { toast } = useToast();

  // ── real-time stock-product subscription ─────────────────────────────────
  const spQuery = useMemoFirebase(
    () => (db ? getStockProductsByStockQuery(db, stockId) : null),
    [db, stockId],
  );
  const { data: stockProducts, isLoading: spLoading } = useCollection<StockProduct>(spQuery);

  // ── inline edit state ────────────────────────────────────────────────────
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // ── left-join products with stockProducts ────────────────────────────────
  const rows: JoinedRow[] = useMemo(() => {
    const spMap = new Map<string, StockProduct & { id: string }>();
    for (const sp of (stockProducts ?? []) as (StockProduct & { id: string })[]) {
      spMap.set(sp.productId, sp);
    }
    return products.map((product) => {
      const sp = spMap.get(product.id) ?? null;
      return {
        product,
        stockProduct: sp,
        quantity: sp?.quantity ?? 0,
      };
    });
  }, [products, stockProducts]);

  // ── handlers ─────────────────────────────────────────────────────────────
  const startEdit = (productId: string, currentQty: number) => {
    setEditingProductId(productId);
    setEditValue(String(currentQty));
  };

  const cancelEdit = () => {
    setEditingProductId(null);
    setEditValue('');
  };

  const saveEdit = async (row: JoinedRow) => {
    if (!db) return;
    const qty = parseInt(editValue, 10);
    if (isNaN(qty) || qty < 0) {
      toast({ variant: 'destructive', title: 'Quantidade invalida.' });
      return;
    }

    setSaving(true);
    try {
      if (row.stockProduct) {
        await updateStockQuantity(db, row.stockProduct.id, qty);
      } else {
        await createStockProduct(db, stockId, row.product.id, qty);
      }
      toast({ title: 'Quantidade atualizada.' });
      setEditingProductId(null);
      setEditValue('');
    } catch (err) {
      console.error('[StockLocationView] save error:', err);
      toast({ variant: 'destructive', title: 'Erro ao salvar quantidade.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddProduct = async (productId: string) => {
    if (!db) return;
    setSaving(true);
    try {
      await createStockProduct(db, stockId, productId, 0);
      toast({ title: 'Produto adicionado ao local.' });
    } catch (err) {
      console.error('[StockLocationView] add product error:', err);
      toast({ variant: 'destructive', title: 'Erro ao adicionar produto.' });
    } finally {
      setSaving(false);
    }
  };

  // ── loading state ────────────────────────────────────────────────────────
  const isLoading = productsLoading || spLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Tristar sync button (placeholder) */}
        {showTristarSync && (
          <div className="flex justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" disabled className="gap-2 opacity-60">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sincronizar com Tristar
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Em breve</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Products table */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 px-6 py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Nenhum produto cadastrado
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adicione produtos no catalogo primeiro.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_120px_80px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Produto</span>
              <span>SKU</span>
              <span className="text-right">Quantidade</span>
              <span />
            </div>

            {/* Rows */}
            {rows.map((row) => {
              const isEditing = editingProductId === row.product.id;
              const hasStockProduct = !!row.stockProduct;

              return (
                <div
                  key={row.product.id}
                  className="grid grid-cols-[1fr_120px_120px_80px] items-center gap-2 border-b last:border-b-0 px-4 py-2.5"
                >
                  {/* Product name + concentration */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.product.name}</p>
                    {row.product.concentration && (
                      <p className="text-xs text-muted-foreground">{row.product.concentration}</p>
                    )}
                  </div>

                  {/* SKU */}
                  <span className="text-xs text-muted-foreground font-mono">
                    {row.product.sku}
                  </span>

                  {/* Quantity (editable) */}
                  <div className="text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <Input
                          type="number"
                          min={0}
                          className="w-20 h-7 text-right text-sm"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(row);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          disabled={saving}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => saveEdit(row)}
                          disabled={saving}
                        >
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        className={
                          row.quantity === 0
                            ? 'text-sm text-destructive font-medium'
                            : 'text-sm font-medium'
                        }
                      >
                        {hasStockProduct ? row.quantity : '—'}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end">
                    {hasStockProduct ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => startEdit(row.product.id, row.quantity)}
                            disabled={isEditing}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar quantidade</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleAddProduct(row.product.id)}
                            disabled={saving}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Adicionar ao local</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
