'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
  getActiveProductsQuery,
  getStocksRef,
  createProduct,
  updateProduct,
  softDeleteProduct,
  createStock,
} from '@/services/products.service';
import { DataTable, type ColumnDef } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { ProductForm } from '@/components/forms/product-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Product, Stock } from '@/types/product';
import type { ProductFormValues } from '@/types/forms';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// ─── page component ───────────────────────────────────────────────────────────

type ProductWithId = Product & { id: string };
type StockWithId   = Stock   & { id: string };

type DialogMode = 'create' | 'edit' | null;

export default function EstoquePage() {
  const db = useFirestore();
  const { toast } = useToast();

  // ── Firestore subscriptions ────────────────────────────────────────────────
  const activeProductsQuery = useMemoFirebase(() => getActiveProductsQuery(db), [db]);
  const { data: products, isLoading: productsLoading } =
    useCollection<Product>(activeProductsQuery);

  const stocksRef = useMemoFirebase(() => getStocksRef(db), [db]);
  const { data: stocks, isLoading: stocksLoading } = useCollection<Stock>(stocksRef);

  // ── Product dialog state ───────────────────────────────────────────────────
  const [productDialog, setProductDialog] = useState<{
    mode: DialogMode;
    product?: ProductWithId;
  }>({ mode: null });
  const [productSaving, setProductSaving] = useState(false);

  // ── Stock dialog state ─────────────────────────────────────────────────────
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockName, setStockName]           = useState('');
  const [stockDesc, setStockDesc]           = useState('');
  const [stockSaving, setStockSaving]       = useState(false);

  // ── handlers ───────────────────────────────────────────────────────────────

  const handleProductSave = async (data: ProductFormValues) => {
    setProductSaving(true);
    try {
      if (productDialog.mode === 'create') {
        await createProduct(db, data);
        toast({ title: 'Produto criado com sucesso.' });
      } else if (productDialog.mode === 'edit' && productDialog.product) {
        await updateProduct(db, productDialog.product.id, {
          name:          data.name,
          description:   data.description,
          sku:           data.sku,
          hsCode:        data.hsCode,
          concentration: data.concentration,
          price:         data.price,
          inventory:     data.inventory ?? 0,
        });
        toast({ title: 'Produto atualizado com sucesso.' });
      }
      setProductDialog({ mode: null });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao salvar produto.', variant: 'destructive' });
    } finally {
      setProductSaving(false);
    }
  };

  const handleDeactivateProduct = async (p: ProductWithId) => {
    try {
      await softDeleteProduct(db, p.id);
      toast({ title: `"${p.name}" desativado.` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao desativar produto.', variant: 'destructive' });
    }
  };

  const handleCreateStock = async () => {
    if (!stockName.trim()) return;
    setStockSaving(true);
    try {
      await createStock(db, { name: stockName.trim(), description: stockDesc.trim() });
      toast({ title: 'Estoque criado com sucesso.' });
      setStockDialogOpen(false);
      setStockName('');
      setStockDesc('');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao criar estoque.', variant: 'destructive' });
    } finally {
      setStockSaving(false);
    }
  };

  // ── columns ────────────────────────────────────────────────────────────────

  const productColumns: ColumnDef<ProductWithId>[] = [
    { key: 'name',          header: 'Nome',          sortable: true },
    { key: 'sku',           header: 'SKU',           sortable: true, className: 'w-32' },
    {
      key: 'concentration',
      header: 'Concentracao',
      render: (p) => p.concentration || '—',
    },
    {
      key: 'price',
      header: 'Preco Lista',
      sortable: true,
      className: 'text-right w-32',
      render: (p) => formatBRL(p.price),
    },
    {
      key: 'inventory',
      header: 'Qtd. Estoque',
      sortable: true,
      className: 'text-right w-32',
      render: (p) => (
        <span className={(p.inventory ?? 0) === 0 ? 'text-destructive font-medium' : ''}>
          {p.inventory ?? 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setProductDialog({ mode: 'edit', product: p });
              }}
            >
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleDeactivateProduct(p);
              }}
            >
              Desativar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const stockColumns: ColumnDef<StockWithId>[] = [
    { key: 'code',        header: 'Cod.',  sortable: true, className: 'w-16' },
    { key: 'name',        header: 'Nome',  sortable: true },
    {
      key: 'description',
      header: 'Descricao',
      render: (s) => s.description || '—',
    },
  ];

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="Produtos & Estoque" />

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="estoques">Locais de Estoque</TabsTrigger>
        </TabsList>

        {/* ── Produtos ──────────────────────────────────────────────────────── */}
        <TabsContent value="produtos" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setProductDialog({ mode: 'create' })}>
              + Novo Produto
            </Button>
          </div>

          <DataTable<ProductWithId>
            columns={productColumns}
            data={(products as ProductWithId[]) ?? []}
            loading={productsLoading}
            searchPlaceholder="Buscar produto por nome ou SKU..."
            emptyMessage="Nenhum produto ativo cadastrado."
          />
        </TabsContent>

        {/* ── Locais de Estoque ─────────────────────────────────────────────── */}
        <TabsContent value="estoques" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setStockDialogOpen(true)}>
              + Novo Local de Estoque
            </Button>
          </div>

          <DataTable<StockWithId>
            columns={stockColumns}
            data={(stocks as StockWithId[]) ?? []}
            loading={stocksLoading}
            searchPlaceholder="Buscar local de estoque..."
            emptyMessage="Nenhum local de estoque cadastrado."
          />
        </TabsContent>
      </Tabs>

      {/* ── Product create / edit dialog ──────────────────────────────────── */}
      <Dialog
        open={productDialog.mode !== null}
        onOpenChange={(open) => {
          if (!open) setProductDialog({ mode: null });
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {productDialog.mode === 'create' ? 'Novo Produto' : 'Editar Produto'}
            </DialogTitle>
          </DialogHeader>

          {productDialog.mode !== null && (
            <ProductForm
              onSubmit={handleProductSave}
              defaultValues={
                productDialog.mode === 'edit' && productDialog.product
                  ? {
                      name:          productDialog.product.name,
                      description:   productDialog.product.description,
                      sku:           productDialog.product.sku,
                      hsCode:        productDialog.product.hsCode,
                      concentration: productDialog.product.concentration,
                      price:         productDialog.product.price,
                      inventory:     productDialog.product.inventory ?? 0,
                    }
                  : undefined
              }
              isLoading={productSaving}
              submitLabel={
                productDialog.mode === 'create' ? 'Criar Produto' : 'Salvar Alteracoes'
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Stock create dialog ───────────────────────────────────────────── */}
      <Dialog
        open={stockDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setStockDialogOpen(false);
            setStockName('');
            setStockDesc('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Local de Estoque</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="stock-name">Nome *</Label>
              <Input
                id="stock-name"
                placeholder="Ex: Galpao Principal"
                value={stockName}
                onChange={(e) => setStockName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateStock()}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stock-desc">Descricao (opcional)</Label>
              <Input
                id="stock-desc"
                placeholder="Detalhes do local"
                value={stockDesc}
                onChange={(e) => setStockDesc(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleCreateStock}
              disabled={!stockName.trim() || stockSaving}
            >
              {stockSaving ? 'Criando...' : 'Criar Local de Estoque'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
