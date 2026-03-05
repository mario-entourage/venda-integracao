'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { OrderStatus } from '@/types';
import type { Order } from '@/types';

// ─── types ───────────────────────────────────────────────────────────────────

interface ChecklistItem {
  label: string;
  status: 'done' | 'pending' | 'in_progress' | 'hidden';
  detail?: string;
  href?: string;
}

interface OrderChecklistProps {
  order: Order;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const PAID_STATUSES = new Set([
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

const SHIPPED_STATUSES = new Set([
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

// ─── component ───────────────────────────────────────────────────────────────

export function OrderChecklist({ order }: OrderChecklistProps) {
  const items: ChecklistItem[] = [];

  // 1. Receita enviada
  items.push({
    label: 'Receita enviada',
    status: order.prescriptionDocId ? 'done' : 'pending',
    detail: order.prescriptionDocId ? undefined : 'Receita não enviada',
  });

  // 2. Pagamento confirmado
  items.push({
    label: 'Pagamento confirmado',
    status: PAID_STATUSES.has(order.status as OrderStatus) ? 'done' : 'pending',
    detail: PAID_STATUSES.has(order.status as OrderStatus)
      ? undefined
      : 'Aguardando pagamento',
  });

  // 3. Procuração assinada (only if procuração was created)
  if (order.zapsignDocId) {
    items.push({
      label: 'Procuração assinada',
      status: order.zapsignStatus === 'signed' ? 'done' : 'in_progress',
      detail: order.zapsignStatus === 'signed'
        ? undefined
        : 'Aguardando assinatura',
    });
  }

  // 4. Comprovante de Vínculo assinado (only if CV was created)
  if (order.zapsignCvDocId) {
    items.push({
      label: 'Comprovante de Vínculo assinado',
      status: order.zapsignCvStatus === 'signed' ? 'done' : 'in_progress',
      detail: order.zapsignCvStatus === 'signed'
        ? undefined
        : 'Aguardando assinatura',
    });
  }

  // 5. ANVISA Solicitação (only for non-exempt orders)
  if (order.anvisaOption !== 'exempt') {
    items.push({
      label: 'ANVISA Solicitação',
      status: order.anvisaRequestId ? 'done' : 'pending',
      detail: order.anvisaRequestId
        ? undefined
        : 'Criar Solicitação',
      href: order.anvisaRequestId
        ? `/anvisa/${order.anvisaRequestId}`
        : `/anvisa/nova?orderId=${order.id}`,
    });

    // 6. Autorização ANVISA (only if request exists)
    if (order.anvisaRequestId) {
      items.push({
        label: 'Autorização ANVISA',
        status: order.anvisaStatus === 'CONCLUIDO' ? 'done' : 'in_progress',
        detail: order.anvisaStatus === 'CONCLUIDO'
          ? undefined
          : 'Em andamento',
        href: `/anvisa/${order.anvisaRequestId}`,
      });
    }
  }

  // 7. Documentos completos
  items.push({
    label: 'Documentos completos',
    status: order.documentsComplete ? 'done' : 'pending',
    detail: order.documentsComplete ? undefined : 'Pendente',
  });

  // 8. Enviado
  items.push({
    label: 'Enviado',
    status: SHIPPED_STATUSES.has(order.status as OrderStatus) ? 'done' : 'pending',
    detail: SHIPPED_STATUSES.has(order.status as OrderStatus)
      ? order.codigoRastreio
        ? `Rastreio: ${order.codigoRastreio}`
        : undefined
      : undefined,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Progresso do Pedido</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              {/* Icon */}
              <div className="mt-0.5 flex-shrink-0">
                {item.status === 'done' && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {item.status === 'in_progress' && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                    <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  </div>
                )}
                {item.status === 'pending' && (
                  <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'text-sm font-medium',
                    item.status === 'done' && 'text-green-700',
                    item.status === 'in_progress' && 'text-amber-700',
                    item.status === 'pending' && 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
                {item.detail && (
                  <>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="ml-2 text-xs text-primary underline hover:no-underline"
                      >
                        {item.detail}
                      </Link>
                    ) : (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
