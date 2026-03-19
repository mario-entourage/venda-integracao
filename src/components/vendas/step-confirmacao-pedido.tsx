'use client';

import React, { useMemo } from 'react';
import type { Step1State } from './step-identificacao';
import type { ProductLine } from './nova-venda-wizard';
import { OrderSummaryCard } from './order-summary-card';

interface StepConfirmacaoPedidoProps {
  orderId: string;
  invoiceNumber?: string;
  repName?: string;
  step1: Step1State;
  products: ProductLine[];
  subtotal: number;
  frete: number;
  total: number;
}

export function StepConfirmacaoPedido({
  orderId,
  invoiceNumber,
  repName,
  step1,
  products,
  subtotal,
  frete,
  total,
}: StepConfirmacaoPedidoProps) {
  const title = useMemo(() => 'Confirmação do Pedido', []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Revise os dados antes de avançar para o pagamento.
      </p>
      <OrderSummaryCard
        title={title}
        kind="pedido"
        orderId={orderId}
        invoiceNumber={invoiceNumber}
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

