import type { Order } from '@/types';
import { OrderStatus, AnvisaOption } from '@/types/enums';

// ---------------------------------------------------------------------------
// In-progress statuses (excludes shipped, delivered, cancelled)
// ---------------------------------------------------------------------------

export const IN_PROGRESS_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PROCESSING,
  OrderStatus.AWAITING_DOCUMENTS,
  OrderStatus.DOCUMENTS_COMPLETE,
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PAID,
];

// ---------------------------------------------------------------------------
// Granular status computation
// ---------------------------------------------------------------------------

export interface GranularStatus {
  /** Key to look up in EXTENDED_STATUS_CONFIG for styling */
  configKey: string;
  /** Human-readable label to display */
  label: string;
  /** List of specific missing items */
  missing: string[];
}

const BASE_LABELS: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Em andamento',
  awaiting_documents: 'Aguard. docs',
  documents_complete: 'Docs OK',
  awaiting_payment: 'Aguard. pagto',
  paid: 'Pago',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

/**
 * Compute a granular display status for an order.
 *
 * For terminal/advanced statuses (shipped, delivered, cancelled) the
 * base label is returned as-is.  For earlier statuses the function checks
 * which items are still missing and returns a descriptive "Falta X + Y"
 * label so users immediately know what needs attention.
 */
export function getGranularStatus(order: Order): GranularStatus {
  const terminal: string[] = [
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ];

  if (terminal.includes(order.status as string)) {
    return {
      configKey: order.status,
      label: BASE_LABELS[order.status] ?? order.status,
      missing: [],
    };
  }

  const missing: string[] = [];

  // Missing payment — order has not reached 'paid' yet
  const notPaid = ![OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(
    order.status as OrderStatus,
  );
  if (notPaid) {
    missing.push('Pagamento');
  }

  // Missing documents
  if (!order.documentsComplete) {
    missing.push('Documentos');
  }

  // Does this order need ANVISA?
  const needsAnvisa =
    !!order.anvisaOption &&
    order.anvisaOption !== AnvisaOption.EXEMPT;

  // Missing ANVISA — needed but not yet concluded
  const anvisaConcluded =
    order.anvisaStatus === 'CONCLUIDO' || order.anvisaStatus === 'concluido';
  if (needsAnvisa && !anvisaConcluded) {
    missing.push('ANVISA');
  }

  // Missing Procuracao — only relevant when ANVISA is needed
  if (needsAnvisa) {
    if (!order.zapsignDocId) {
      missing.push('Procuracao');
    } else if (order.zapsignStatus !== 'signed') {
      missing.push('Procuracao (assinatura)');
    }
  }

  // Missing Power of Attorney — doc exists but not yet signed
  if (order.zapsignPoaDocId && order.zapsignPoaStatus !== 'signed') {
    missing.push('Power of Attorney');
  }

  // Missing Comprovante de Vinculo — doc exists but not yet signed
  if (order.zapsignCvDocId && order.zapsignCvStatus !== 'signed') {
    missing.push('Comprovante');
  }

  if (missing.length === 0) {
    return {
      configKey: order.status,
      label: BASE_LABELS[order.status] ?? order.status,
      missing: [],
    };
  }

  return {
    configKey: 'falta',
    label: 'Falta ' + missing.join(' + '),
    missing,
  };
}

// ---------------------------------------------------------------------------
// Extended status config (base statuses + "falta" styling)
// ---------------------------------------------------------------------------

export const EXTENDED_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:            { label: 'Pendente',       className: 'border-slate-300 text-slate-600 bg-slate-50' },
  processing:         { label: 'Em andamento',   className: 'border-blue-300 text-blue-700 bg-blue-50' },
  awaiting_documents: { label: 'Aguard. docs',   className: 'border-amber-300 text-amber-700 bg-amber-50' },
  documents_complete: { label: 'Docs OK',        className: 'border-teal-300 text-teal-700 bg-teal-50' },
  awaiting_payment:   { label: 'Aguard. pagto',  className: 'border-orange-300 text-orange-700 bg-orange-50' },
  paid:               { label: 'Pago',           className: 'border-green-300 text-green-700 bg-green-50' },
  shipped:            { label: 'Enviado',        className: 'border-purple-300 text-purple-700 bg-purple-50' },
  delivered:          { label: 'Entregue',       className: 'border-green-400 text-green-800 bg-green-100' },
  cancelled:          { label: 'Cancelado',      className: 'border-red-300 text-red-600 bg-red-50' },
  falta:              { label: 'Falta...',       className: 'border-orange-300 text-orange-700 bg-orange-50' },
};
