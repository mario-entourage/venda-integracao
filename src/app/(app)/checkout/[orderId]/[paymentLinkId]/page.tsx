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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  created: { label: 'Aguardando', className: 'border-amber-300 text-amber-700 bg-amber-50' },
  pending: { label: 'Pendente', className: 'border-amber-300 text-amber-700 bg-amber-50' },
  paid: { label: 'Pago', className: 'border-green-300 text-green-700 bg-green-50' },
  approved: { label: 'Aprovado', className: 'border-green-300 text-green-700 bg-green-50' },
  completed: { label: 'Concluído', className: 'border-green-400 text-green-800 bg-green-100' },
  success: { label: 'Concluído', className: 'border-green-400 text-green-800 bg-green-100' },
  failed: { label: 'Falhou', className: 'border-red-300 text-red-600 bg-red-50' },
  cancelled: { label: 'Cancelado', className: 'border-red-300 text-red-600 bg-red-50' },
  expired: { label: 'Expirado', className: 'border-slate-300 text-slate-500 bg-slate-50' },
};

function statusConfig(s: string) {
  return STATUS_CONFIG[s] ?? {
    label: s,
    className: 'border-slate-300 text-slate-600 bg-slate-50',
  };
}

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
  return new Date(t.seconds * 1000).toLocaleString('pt-BR');
};

type ExtPaymentLink = PaymentLink & {
  id: string;
  paymentUrl?: string;
};

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

  // Load payment link data
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

  // ✅ Redirect when payment is successful
  useEffect(() => {
    if (!link) return;

    const successStatuses = ['paid', 'approved', 'completed', 'success'];

    if (successStatuses.includes(link.status)) {
      router.replace('/checkout/success');
    }
  }, [link, router]);

  if (loading) {
    return <div className="p-6">Carregando pagamento...</div>;
  }

  if (!link) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.push('/checkout')}>
          ← Voltar
        </Button>
        <p className="mt-4 text-muted-foreground">Link de pagamento não encontrado.</p>
      </div>
    );
  }

  const cfg = statusConfig(link.status);

  const linkedPayments = payments.filter((p) => p.paymentLinkId === link.id);

  return (
    <div className="space-y-6">

      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.push('/checkout')}>
          ← Voltar
        </Button>

        <h1 className="text-2xl font-bold">Link de Pagamento</h1>

        <Badge variant="outline" className={cn('ml-auto text-xs', cfg.className)}>
          {cfg.label}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes do Pagamento</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-sm">
          <p><strong>ID:</strong> {link.id}</p>
          <p><strong>Valor:</strong> {fmtAmount(link.amount, link.currency)}</p>
          <p><strong>Cliente:</strong> {customer?.name || '—'}</p>
          <p><strong>Status:</strong> {cfg.label}</p>
          <p><strong>Criado:</strong> {fmtDateTime(link.createdAt)}</p>

          {link.paymentUrl && (
            <a
              href={link.paymentUrl}
              target="_blank"
              className="text-primary underline"
            >
              Abrir página de pagamento
            </a>
          )}
        </CardContent>
      </Card>

      {linkedPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagamentos Confirmados</CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            {linkedPayments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{p.id.slice(0, 10)}</span>
                <span>{fmtAmount(p.amount, p.currency)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  );
}