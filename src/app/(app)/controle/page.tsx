'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
  getOrdersByDateRangeQuery,
  getOrderSubcollectionDocs,
  updateOrder,
} from '@/services/orders.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type {
  Order,
  OrderCustomer,
  OrderRepresentative,
  OrderDoctor,
  OrderProduct,
  OrderShipping,
} from '@/types';
import type { PaymentLink } from '@/types/payment';
import type { Client } from '@/types/client';

// ---------------------------------------------------------------------------
// Constants — dropdown options
// ---------------------------------------------------------------------------

const MEIO_PAGAMENTO_OPTIONS = [
  { value: 'Global Pays', label: 'Global Pays' },
  { value: 'Infinity Pays', label: 'Infinity Pays' },
  { value: 'PIX', label: 'PIX' },
  { value: 'Brazil Pays', label: 'Brazil Pays' },
];

const STATUS_ORCAMENTO_OPTIONS = [
  { value: 'Em negociação', label: 'Em negociação' },
  { value: 'Sem retorno', label: 'Sem retorno' },
  { value: 'Aguardando pagamento', label: 'Aguardando pagamento' },
  { value: 'Aguardando documentos', label: 'Aguardando documentos' },
  { value: 'Venda finalizada', label: 'Venda finalizada' },
  { value: 'Venda declinada', label: 'Venda declinada' },
  { value: 'Judicialização', label: 'Judicialização' },
  { value: 'Doação', label: 'Doação' },
  { value: 'Óbito', label: 'Óbito' },
  { value: 'Amostra', label: 'Amostra' },
];

const LEAD_OPTIONS = [
  { value: 'Primeira compra', label: 'Primeira compra' },
  { value: 'Recompra', label: 'Recompra' },
  { value: 'Envio lote atualizado', label: 'Envio lote atualizado' },
  { value: 'Envio pendência', label: 'Envio pendência' },
];

const FORMA_ENVIO_OPTIONS = [
  { value: 'Loggi', label: 'Loggi' },
  { value: 'TriStar', label: 'TriStar' },
  { value: 'Motoboy', label: 'Motoboy' },
  { value: 'SEDEX', label: 'SEDEX' },
  { value: 'SEDEX 10', label: 'SEDEX 10' },
  { value: 'SEDEX 12', label: 'SEDEX 12' },
  { value: 'PAC', label: 'PAC' },
  { value: 'Uber', label: 'Uber' },
  { value: 'Em mãos', label: 'Em mãos' },
  { value: 'Via Euclides', label: 'Via Euclides' },
  { value: 'Jadlog', label: 'Jadlog' },
];

const STATUS_ENVIO_OPTIONS = [
  { value: 'Envio Pendente', label: 'Envio Pendente' },
  { value: 'Envio Realizado', label: 'Envio Realizado' },
  { value: 'Recebido', label: 'Recebido' },
  { value: 'Extraviado', label: 'Extraviado' },
  { value: 'Entrega Suspensa', label: 'Entrega Suspensa' },
  { value: 'Devolvido ao Remetente', label: 'Devolvido ao Remetente' },
];

// Product columns — matched by substring in productName
const PRODUCT_COLUMNS = [
  { key: 'qty3500', label: '3500+mg (Qtd)', pattern: '3500' },
  { key: 'qty5400', label: '5400+mg (Qtd)', pattern: '5400' },
  { key: 'qty7000', label: '7000+mg (Qtd)', pattern: '7000' },
  { key: 'qty1750', label: '1750+mg (Qtd)', pattern: '1750' },
  { key: 'qty2700', label: '2700+mg (Qtd)', pattern: '2700' },
  { key: 'qty4500', label: '4500+mg (Qtd)', pattern: '4500' },
  { key: 'qtyThcStrip', label: 'THC Oral Strip - 10mg', pattern: 'THC Oral Strip' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtUSD = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

const fmtDate = (ts: { seconds: number } | undefined | null): string => {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR');
};

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatAddress(addr: { street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string } | undefined | null): string {
  if (!addr) return '—';
  const parts = [addr.street, addr.number, addr.complement, addr.neighborhood, addr.city, addr.state].filter(Boolean);
  return parts.join(', ') || '—';
}

// ---------------------------------------------------------------------------
// Enriched row type
// ---------------------------------------------------------------------------

interface ControleRow {
  id: string; // order ID
  order: Order;
  // Read-only derived fields
  representante: string;
  dataOrcamento: string;
  dataVenda: string;
  invoiceGlobalPays: string;
  // Product quantities
  productQtys: Record<string, number>;
  priceListUSD: number;
  valorLiquido: number;
  valorLiquidoMenosFrete: number;
  usdbrl: number;
  cliente: string;
  telefone: string;
  email: string;
  medico: string;
  crmCroRqe: string;
  endereco: string;
  cep: string;
  // Editable (stored on Order)
  invoiceCorrecao: string;
  meioPagamento: string;
  statusOrcamento: string;
  lead: string;
  formaEnvio: string;
  lote: string;
  dataEnvio: string;
  previsaoEntrega: string;
  codigoRastreio: string;
  statusEnvio: string;
}

// ---------------------------------------------------------------------------
// Inline editing components
// ---------------------------------------------------------------------------

function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <Select value={value || '_empty'} onValueChange={(v) => onChange(v === '_empty' ? '' : v)}>
      <SelectTrigger className="h-7 w-full min-w-[150px] text-xs">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_empty">—</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InlineText({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);

  // Sync when external value changes
  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onChange(local);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder ?? '—'}
      className={`h-7 text-xs min-w-[120px] ${className ?? ''}`}
    />
  );
}

function InlineDateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <Input
      type="date"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 text-xs min-w-[130px]"
    />
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ControlePage() {
  const { firestore, user, isAdmin } = useFirebase();
  const { toast } = useToast();

  // Date filter state
  const [dateFrom, setDateFrom] = useState(startOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);

  // Derive Date objects for query
  const fromDate = useMemo(() => {
    const d = new Date(dateFrom + 'T00:00:00');
    return isNaN(d.getTime()) ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : d;
  }, [dateFrom]);

  const toDate = useMemo(() => {
    const d = new Date(dateTo + 'T23:59:59.999');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [dateTo]);

  // Firestore query for orders in date range
  const ordersQuery = useMemoFirebase(
    () => (firestore ? getOrdersByDateRangeQuery(firestore, fromDate, toDate) : null),
    [firestore, fromDate, toDate],
  );

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(ordersQuery);

  // Enriched rows
  const [rows, setRows] = useState<ControleRow[]>([]);
  const [enriching, setEnriching] = useState(false);

  // Pagination
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(0);

  // Load subcollections for each order
  useEffect(() => {
    if (!firestore || !orders) {
      setRows([]);
      return;
    }

    if (orders.length === 0) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setEnriching(true);

    async function loadDetails() {
      const details = await Promise.all(
        orders!.map(async (order) => {
          const [customers, reps, doctors, products, paymentLinks, shippings] =
            await Promise.all([
              getOrderSubcollectionDocs<OrderCustomer>(firestore!, order.id, 'customer'),
              getOrderSubcollectionDocs<OrderRepresentative>(firestore!, order.id, 'representative'),
              getOrderSubcollectionDocs<OrderDoctor>(firestore!, order.id, 'doctor'),
              getOrderSubcollectionDocs<OrderProduct>(firestore!, order.id, 'products'),
              getOrderSubcollectionDocs<PaymentLink>(firestore!, order.id, 'paymentLinks'),
              getOrderSubcollectionDocs<OrderShipping>(firestore!, order.id, 'shipping'),
            ]);
          return {
            order,
            customer: customers[0] ?? null,
            rep: reps[0] ?? null,
            doctor: doctors[0] ?? null,
            products,
            paymentLink: paymentLinks[0] ?? null,
            shipping: shippings[0] ?? null,
          };
        }),
      );

      if (cancelled) return;

      // Batch-load Client docs for phone/email
      const clientIds = [
        ...new Set(
          details
            .map((d) => d.customer?.userId)
            .filter((id): id is string => !!id),
        ),
      ];

      const clientMap = new Map<string, Client>();
      await Promise.all(
        clientIds.map(async (clientId) => {
          try {
            const clientDoc = await getDoc(doc(firestore!, 'clients', clientId));
            if (clientDoc.exists()) {
              clientMap.set(clientId, {
                id: clientDoc.id,
                ...clientDoc.data(),
              } as Client & { id: string });
            }
          } catch {
            /* client not found — skip */
          }
        }),
      );

      if (cancelled) return;

      // Build rows
      const enrichedRows: ControleRow[] = details.map((d) => {
        const client = d.customer?.userId
          ? clientMap.get(d.customer.userId)
          : null;

        // Product quantities
        const productQtys: Record<string, number> = {};
        for (const col of PRODUCT_COLUMNS) {
          const matching = d.products.filter((p) =>
            (p.productName ?? '').includes(col.pattern),
          );
          productQtys[col.key] = matching.reduce((sum, p) => sum + p.quantity, 0);
        }

        // Price list = sum of USD list price × qty
        const priceListUSD = d.products.reduce(
          (sum, p) => sum + p.price * p.quantity,
          0,
        );

        const shippingCost = d.shipping?.price ?? 0;
        const shippingAddr = d.shipping?.address ?? client?.address ?? null;

        return {
          id: d.order.id,
          order: d.order,
          representante: d.rep?.name ?? '—',
          dataOrcamento: fmtDate(
            d.paymentLink?.createdAt as unknown as { seconds: number } | null,
          ),
          dataVenda: fmtDate(
            d.order.createdAt as unknown as { seconds: number },
          ),
          invoiceGlobalPays: d.order.invoice ?? '',
          productQtys,
          priceListUSD,
          valorLiquido: d.order.amount ?? 0,
          valorLiquidoMenosFrete: (d.order.amount ?? 0) - shippingCost,
          usdbrl: d.order.exchangeRate ?? 0,
          cliente: d.customer?.name ?? '—',
          telefone: client?.phone ?? '—',
          email: client?.email ?? '—',
          medico: d.doctor?.name ?? '—',
          crmCroRqe: d.doctor?.crm ?? '—',
          endereco: formatAddress(shippingAddr),
          cep: shippingAddr?.postalCode ?? '—',
          // Editable fields
          invoiceCorrecao: d.order.invoiceCorrecao ?? '',
          meioPagamento: d.order.meioPagamento ?? '',
          statusOrcamento: d.order.statusOrcamento ?? '',
          lead: d.order.lead ?? '',
          formaEnvio: d.order.formaEnvio ?? '',
          lote: d.order.lote ?? '',
          dataEnvio: d.order.dataEnvio ?? '',
          previsaoEntrega: d.order.previsaoEntrega ?? '',
          codigoRastreio: d.order.codigoRastreio ?? '',
          statusEnvio: d.order.statusEnvio ?? '',
        };
      });

      if (!cancelled) {
        setRows(enrichedRows);
        setEnriching(false);
      }
    }

    loadDetails().catch((err) => {
      console.error('[Controle] Failed to load order details:', err);
      if (!cancelled) setEnriching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [firestore, orders]);

  // Reset page when data changes
  useEffect(() => {
    setCurrentPage(0);
  }, [rows]);

  // Inline field update
  const handleFieldChange = useCallback(
    async (orderId: string, field: string, value: string) => {
      if (!firestore || !user) return;
      try {
        await updateOrder(firestore, orderId, {
          [field]: value,
          updatedById: user.uid,
        } as Partial<Order>);
        // Optimistic: update local rows
        setRows((prev) =>
          prev.map((r) =>
            r.id === orderId ? { ...r, [field]: value } : r,
          ),
        );
      } catch (err) {
        console.error('[Controle] Update failed:', err);
        toast({
          title: 'Erro ao atualizar campo',
          description: err instanceof Error ? err.message : 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    },
    [firestore, user, toast],
  );

  // Pagination helpers
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  const isLoading = ordersLoading || enriching;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle de Pedidos"
        description="Visão geral com edição inline de todos os pedidos"
        action={isAdmin ? { label: 'Importar CSV', href: '/controle/importar' } : undefined}
      />

      {/* ── Date filter ──────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Data Venda — De</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data Venda — Até</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <p className="text-sm text-muted-foreground pb-1">
              {rows.length} pedido{rows.length !== 1 ? 's' : ''} encontrado
              {rows.length !== 1 ? 's' : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">
              Nenhum pedido encontrado no período selecionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {/* ── Identificação ── */}
                    <TableHead className="sticky left-0 z-10 bg-muted/50 min-w-[140px]">Representante</TableHead>
                    <TableHead className="min-w-[110px]">Data Orçamento</TableHead>
                    <TableHead className="min-w-[110px]">Data Venda</TableHead>
                    <TableHead className="min-w-[150px]">Nº Invoice (Global Pays)</TableHead>
                    <TableHead className="min-w-[170px]">Nº Invoice (Correção Duplicata)</TableHead>

                    {/* ── Produtos ── */}
                    {PRODUCT_COLUMNS.map((col) => (
                      <TableHead key={col.key} className="min-w-[90px] text-center">
                        {col.label}
                      </TableHead>
                    ))}

                    {/* ── Financeiro ── */}
                    <TableHead className="min-w-[160px]">Meio de Pagamento</TableHead>
                    <TableHead className="min-w-[110px] text-right">Price List</TableHead>
                    <TableHead className="min-w-[120px] text-right">Valor Líquido R$</TableHead>
                    <TableHead className="min-w-[150px] text-right">Valor Líquido (- Frete) R$</TableHead>
                    <TableHead className="min-w-[90px] text-right">USDBRL</TableHead>

                    {/* ── Status / Lead ── */}
                    <TableHead className="min-w-[180px]">Status do Orçamento</TableHead>
                    <TableHead className="min-w-[160px]">Lead</TableHead>

                    {/* ── Cliente / Médico ── */}
                    <TableHead className="min-w-[160px]">Cliente</TableHead>
                    <TableHead className="min-w-[130px]">Telefone</TableHead>
                    <TableHead className="min-w-[170px]">E-mail</TableHead>
                    <TableHead className="min-w-[140px]">Médico</TableHead>
                    <TableHead className="min-w-[120px]">CRM / CRO / RQE</TableHead>

                    {/* ── Envio ── */}
                    <TableHead className="min-w-[160px]">Forma de envio</TableHead>
                    <TableHead className="min-w-[200px]">Endereço</TableHead>
                    <TableHead className="min-w-[100px]">CEP</TableHead>
                    <TableHead className="min-w-[120px]">Lote</TableHead>
                    <TableHead className="min-w-[130px]">Data do Envio</TableHead>
                    <TableHead className="min-w-[140px]">Previsão de Entrega</TableHead>
                    <TableHead className="min-w-[140px]">Código de Rastreio</TableHead>
                    <TableHead className="min-w-[170px]">Status do Envio</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/30">
                      {/* Representante (sticky) */}
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        {row.representante}
                      </TableCell>

                      {/* Data Orçamento */}
                      <TableCell>{row.dataOrcamento}</TableCell>

                      {/* Data Venda */}
                      <TableCell>{row.dataVenda}</TableCell>

                      {/* Nº Invoice (Global Pays) — editable */}
                      <TableCell>
                        <InlineText
                          value={row.invoiceGlobalPays}
                          onChange={(v) => handleFieldChange(row.id, 'invoice', v)}
                        />
                      </TableCell>

                      {/* Nº Invoice (Correção Duplicata) — editable */}
                      <TableCell>
                        <InlineText
                          value={row.invoiceCorrecao}
                          onChange={(v) => handleFieldChange(row.id, 'invoiceCorrecao', v)}
                        />
                      </TableCell>

                      {/* Product qty columns */}
                      {PRODUCT_COLUMNS.map((col) => (
                        <TableCell key={col.key} className="text-center">
                          {row.productQtys[col.key] || '—'}
                        </TableCell>
                      ))}

                      {/* Meio de Pagamento — editable */}
                      <TableCell>
                        <InlineSelect
                          value={row.meioPagamento}
                          options={MEIO_PAGAMENTO_OPTIONS}
                          onChange={(v) => handleFieldChange(row.id, 'meioPagamento', v)}
                        />
                      </TableCell>

                      {/* Price List (USD) */}
                      <TableCell className="text-right font-mono">
                        {fmtUSD(row.priceListUSD)}
                      </TableCell>

                      {/* Valor Líquido R$ */}
                      <TableCell className="text-right font-mono">
                        {fmtBRL(row.valorLiquido)}
                      </TableCell>

                      {/* Valor Líquido (menos Frete) R$ */}
                      <TableCell className="text-right font-mono">
                        {fmtBRL(row.valorLiquidoMenosFrete)}
                      </TableCell>

                      {/* USDBRL */}
                      <TableCell className="text-right font-mono">
                        {row.usdbrl ? row.usdbrl.toFixed(4) : '—'}
                      </TableCell>

                      {/* Status do Orçamento — editable */}
                      <TableCell>
                        <InlineSelect
                          value={row.statusOrcamento}
                          options={STATUS_ORCAMENTO_OPTIONS}
                          onChange={(v) => handleFieldChange(row.id, 'statusOrcamento', v)}
                        />
                      </TableCell>

                      {/* Lead — editable */}
                      <TableCell>
                        <InlineSelect
                          value={row.lead}
                          options={LEAD_OPTIONS}
                          onChange={(v) => handleFieldChange(row.id, 'lead', v)}
                        />
                      </TableCell>

                      {/* Cliente */}
                      <TableCell>{row.cliente}</TableCell>

                      {/* Telefone */}
                      <TableCell>{row.telefone}</TableCell>

                      {/* E-mail */}
                      <TableCell className="max-w-[200px] truncate" title={row.email}>
                        {row.email}
                      </TableCell>

                      {/* Médico */}
                      <TableCell>{row.medico}</TableCell>

                      {/* CRM / CRO / RQE */}
                      <TableCell>{row.crmCroRqe}</TableCell>

                      {/* Forma de envio — editable */}
                      <TableCell>
                        <InlineSelect
                          value={row.formaEnvio}
                          options={FORMA_ENVIO_OPTIONS}
                          onChange={(v) => handleFieldChange(row.id, 'formaEnvio', v)}
                        />
                      </TableCell>

                      {/* Endereço */}
                      <TableCell className="max-w-[250px] truncate" title={row.endereco}>
                        {row.endereco}
                      </TableCell>

                      {/* CEP */}
                      <TableCell>{row.cep}</TableCell>

                      {/* Lote — editable */}
                      <TableCell>
                        <InlineText
                          value={row.lote}
                          onChange={(v) => handleFieldChange(row.id, 'lote', v)}
                        />
                      </TableCell>

                      {/* Data do Envio — editable */}
                      <TableCell>
                        <InlineDateInput
                          value={row.dataEnvio}
                          onChange={(v) => handleFieldChange(row.id, 'dataEnvio', v)}
                        />
                      </TableCell>

                      {/* Previsão de Entrega — editable */}
                      <TableCell>
                        <InlineDateInput
                          value={row.previsaoEntrega}
                          onChange={(v) => handleFieldChange(row.id, 'previsaoEntrega', v)}
                        />
                      </TableCell>

                      {/* Código de Rastreio — editable */}
                      <TableCell>
                        <InlineText
                          value={row.codigoRastreio}
                          onChange={(v) => handleFieldChange(row.id, 'codigoRastreio', v)}
                          className="font-mono"
                        />
                      </TableCell>

                      {/* Status do Envio — editable */}
                      <TableCell>
                        <InlineSelect
                          value={row.statusEnvio}
                          options={STATUS_ENVIO_OPTIONS}
                          onChange={(v) => handleFieldChange(row.id, 'statusEnvio', v)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Pagination ─────────────────────────────────────────── */}
          {rows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Mostrando {currentPage * PAGE_SIZE + 1} a{' '}
                {Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} de{' '}
                {rows.length} pedidos
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {currentPage + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={currentPage >= totalPages - 1}
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
