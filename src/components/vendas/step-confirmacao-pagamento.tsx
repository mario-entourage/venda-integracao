'use client';

import React, { useMemo } from 'react';
import type { Step1State } from './step-identificacao';
import type { ProductLine } from './nova-venda-wizard';
import { OrderSummaryCard } from './order-summary-card';

interface StepConfirmacaoPagamentoProps {
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

export function StepConfirmacaoPagamento({
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
}: StepConfirmacaoPagamentoProps) {
  const title = useMemo(() => 'Confirmação do Pagamento', []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Confirme o link e o invoice gerados antes de seguir para ZapSign e envio.
      </p>
      <OrderSummaryCard
        title={title}
        kind="pagamento"
        orderId={orderId}
        invoiceNumber={invoiceNumber}
        gpOrderId={gpOrderId}
        paymentUrl={paymentUrl}
        repName={repName}
        step1={step1}
        products={products}
        subtotal={subtotal}
        frete={frete}
        total={total}
      />
    </div>
  );
}

