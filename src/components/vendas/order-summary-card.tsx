'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Step1State } from './step-identificacao';
import type { ProductLine } from './nova-venda-wizard';
import { buildOrderResumoText, formatCurrencyBRL, formatOrderShortId } from './order-summary';

interface OrderSummaryCardProps {
  title: string;
  kind: 'pedido' | 'pagamento';
  orderId: string;
  invoiceNumber?: string;
  gpOrderId?: string;
  paymentUrl?: string;
  repName?: string;
  step1: Step1State;
  products: ProductLine[];
  subtotal: number;
  frete: number;
  total: number;
}

export function OrderSummaryCard({
  title,
  kind,
  orderId,
  invoiceNumber,
  gpOrderId,
  paymentUrl,
  repName,
  step1,
  products,
  subtotal,
  frete,
  total,
}: OrderSummaryCardProps) {
  const [copied, setCopied] = useState(false);

  const resumoText = useMemo(
    () =>
      buildOrderResumoText({
        kind,
        orderId,
        invoiceNumber,
        gpOrderId,
        paymentUrl,
        repName,
        step1,
        products,
        subtotal,
        frete,
        total,
      }),
    [kind, orderId, invoiceNumber, gpOrderId, paymentUrl, repName, step1, products, subtotal, frete, total],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resumoText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {formatOrderShortId(orderId)}
          </Badge>
          <Badge variant="outline" className="font-mono">
            {invoiceNumber || '—'}
          </Badge>
          {repName && (
            <Badge variant="outline">
              {repName}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Paciente</p>
            <p className="text-sm font-medium">{step1.clientName || '—'}</p>
            {step1.clientDocument && (
              <p className="text-xs text-muted-foreground">{step1.clientDocument}</p>
            )}
            {step1.clientPhone && (
              <p className="text-xs text-muted-foreground">{step1.clientPhone}</p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Médico</p>
            <p className="text-sm font-medium">{step1.doctorName || '—'}</p>
            {step1.doctorCrm && (
              <p className="text-xs text-muted-foreground">{step1.doctorCrm}</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Produtos</p>
          <div className="space-y-1">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {p.productName} <span className="text-muted-foreground">x{p.quantity}</span>
                </span>
                <span className="font-medium">{formatCurrencyBRL(p.negotiatedPrice * p.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrencyBRL(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Frete</span>
              <span className="font-medium">{formatCurrencyBRL(frete)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-primary">{formatCurrencyBRL(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {kind === 'pagamento' && paymentUrl ? (
              <p className="text-xs text-muted-foreground truncate">
                Link: {paymentUrl}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Use &quot;Próximo Passo&quot; para continuar.
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
            {copied ? 'Copiado' : 'Copiar Resumo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
