'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { getOrderPaymentLinksRef, getOrderPayments } from '@/services/payments.service';
import { getOrderSubcollectionDocs } from '@/services/orders.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PaymentLink, Payment, OrderCustomer } from '@/types';

// ─── status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  created:   { label: 'Aguardando',  className: 'border-amber-300 text-amber-700 bg-amber-50' },
  pending:   { label: 'Pendente',    className: 'border-amber-300 text-amber-700 bg-amber-50' },
  paid:      { label: 'Pago',        className: 'border-green-300 text-green-700 bg-green-50' },
  approved:  { label: 'Aprovado',    className: 'border-green-300 text-green-700 bg-green-50' },
  completed: { label: 'Concluído',   className: 'border-green-400 text-green-800 bg-green-100' },
  success:   { label: 'Concluído',   className: 'border-green-400 text-green-800 bg-green-100' },
  failed:    { label: 'Falhou',      className: 'border-red-300 text-red-600 bg-red-50' },
  cancelled: { label: 'Cancelado',   className: 'border-red-300 text-red-600 bg-red-50' },
  expired:   { label: 'Expirado',    className: 'border-slate-300 text-slate-500 bg-slate-50' },
};

function statusConfig(s: string) {
  return STATUS_CONFIG[s] ?? { label: s, className: 'border-slate-300 text-slate-600 bg-slate-50' };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  } catch {
    return `${currency} ${amount?.toFixed(2) ?? '—'}`;
  }
}

const fmtDateTime = (ts: unknown) => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

// ─── field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm sm:col-span-2 sm:mt-0 break-all">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

// ─── extended type to cover paymentUrl stored in Firestore ────────────────────

type ExtPaymentLink = PaymentLink & {
  id: string;
  paymentUrl?: string;
};

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PagamentoDetailPage() {
  const { orderId, paymentLinkId } = useParams<{
    orderId: string;
    paymentLinkId: string;
  }>();
  const router = useRouter();
  const { firestore } = useFirebase();

  const [link, setLink] = useState<ExtPaymentLink | null>(null);
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [payments, setPayments] = useState<(Payment & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !orderId || !paymentLinkId) return;

    setLoading(true);
    const linkRef = doc(getOrderPaymentLinksRef(firestore, orderId), paymentLinkId);

    Promise.all([
      getDoc(linkRef),
      getOrderSubcollectionDocs<OrderCustomer>(firestore, orderId, 'customer'),
      getOrderPayments(firestore, orderId),
    ])
      .then(([linkSnap, customers, pmts]) => {
        if (linkSnap.exists()) {
          setLink({ id: linkSnap.id, ...linkSnap.data() } as ExtPaymentLink);
        }
        setCustomer(customers[0] ?? null);
        setPayments(pmts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [firestore, orderId, paymentLinkId]);

  // ── loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
        <div className="h-40 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!link) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/checkout')}>
          ← Voltar
        </Button>
        <p className="text-muted-foreground">Link de pagamento não encontrado.</p>
      </div>
    );
  }

  const cfg = statusConfig(link.status);

  // Payments linked to this payment link
  const linkedPayments = payments.filter((p) => p.paymentLinkId === link.id);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/checkout')}
          className="-ml-2"
        >
          ← Voltar
        </Button>
        <h1 className="font-headline text-2xl font-bold">Link de Pagamento</h1>
        <Badge variant="outline" className={cn('ml-auto text-xs', cfg.className)}>
          {cfg.label}
        </Badge>
      </div>

      {/* ── Payment link details ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes do Pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <FieldRow label="ID do Link" value={<span className="font-mono text-xs">{link.id}</span>} />
            <FieldRow label="Status" value={
              <Badge variant="outline" className={cn('text-xs', cfg.className)}>
                {cfg.label}
              </Badge>
            } />
            <FieldRow label="Valor" value={
              <span className="font-semibold">{fmtAmount(link.amount, link.currency)}</span>
            } />
            <FieldRow label="Moeda" value={link.currency || '—'} />
            <FieldRow label="Provedor" value={link.provider || '—'} />
            <FieldRow label="Cliente" value={customer?.name || '—'} />
            <FieldRow label="CPF do Cliente" value={customer?.document || '—'} />
            <FieldRow label="Pedido Vinculado" value={
              <button
                className="font-mono text-xs text-primary hover:underline"
                onClick={() => router.push(`/controle/${orderId}`)}
              >
                #{orderId.slice(0, 8).toUpperCase()} →
              </button>
            } />
            <FieldRow
              label="ID de Referência (GlobalPay)"
              value={
                link.referenceId
                  ? <span className="font-mono text-xs">{link.referenceId}</span>
                  : null
              }
            />
            <FieldRow
              label="URL de Pagamento"
              value={
                link.paymentUrl ? (
                  <a
                    href={link.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {link.paymentUrl}
                  </a>
                ) : null
              }
            />
            <FieldRow
              label="Método de Pagamento"
              value={link.paymentMethod || null}
            />
            <FieldRow
              label="Câmbio no Pagamento"
              value={
                link.exchangeAtPayment != null
                  ? `R$ ${Number(link.exchangeAtPayment).toFixed(4)}`
                  : null
              }
            />
            <FieldRow
              label="Taxa do Lojista"
              value={link.feeForMerchant ? 'Sim' : 'Não'}
            />
            <FieldRow
              label="Parcelas (Lojista)"
              value={link.installmentMerchant != null ? String(link.installmentMerchant) : null}
            />
            <FieldRow
              label="Parcelas (Cliente)"
              value={link.installmentCustomer != null ? String(link.installmentCustomer) : null}
            />
            <FieldRow label="Expira em" value={fmtDateTime(link.expiresAt)} />
            <FieldRow label="Criado em" value={fmtDateTime(link.createdAt)} />
            <FieldRow label="Atualizado em" value={fmtDateTime(link.updatedAt)} />
          </dl>
        </CardContent>
      </Card>

      {/* ── Confirmed payments for this link ── */}
      {linkedPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamentos Confirmados</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 pl-6 text-left font-medium text-muted-foreground">ID</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Valor</th>
                    <th className="pb-2 pr-6 text-right font-medium text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedPayments.map((p) => {
                    const pcfg = statusConfig(p.status);
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2.5 pl-6 font-mono text-xs">{p.id.slice(0, 12)}…</td>
                        <td className="py-2.5">
                          <Badge variant="outline" className={cn('text-xs', pcfg.className)}>
                            {pcfg.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {fmtAmount(p.amount, p.currency)}
                        </td>
                        <td className="py-2.5 pr-6 text-right text-muted-foreground">
                          {fmtDateTime(p.paymentDate ?? p.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
