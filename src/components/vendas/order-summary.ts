import type { Step1State } from './step-identificacao';
import type { ProductLine } from './nova-venda-wizard';

export function formatOrderShortId(orderId: string): string {
  if (!orderId) return '—';
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

export function formatCurrencyBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function buildOrderResumoText(params: {
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
}): string {
  const {
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
  } = params;

  const lines: string[] = [];
  lines.push(kind === 'pedido' ? 'Resumo do Pedido' : 'Resumo do Pagamento');
  lines.push('');
  lines.push(`Pedido: ${formatOrderShortId(orderId)}`);
  lines.push(`Invoice: ${invoiceNumber || '—'}`);
  if (gpOrderId) lines.push(`GlobalPay Ref: ${gpOrderId}`);
  if (repName) lines.push(`Representante: ${repName}`);
  lines.push('');
  lines.push(`Paciente: ${step1.clientName || '—'}`);
  if (step1.clientDocument) lines.push(`Documento: ${step1.clientDocument}`);
  if (step1.clientPhone) lines.push(`Telefone: ${step1.clientPhone}`);
  lines.push(`Médico: ${step1.doctorName || '—'}`);
  if (step1.doctorCrm) lines.push(`CRM: ${step1.doctorCrm}`);
  lines.push('');
  lines.push('Produtos:');
  for (const p of products) {
    const lineTotal = p.negotiatedPrice * p.quantity;
    lines.push(`- ${p.productName} x${p.quantity} — ${formatCurrencyBRL(lineTotal)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${formatCurrencyBRL(subtotal)}`);
  lines.push(`Frete: ${formatCurrencyBRL(frete)}`);
  lines.push(`Total: ${formatCurrencyBRL(total)}`);
  if (kind === 'pagamento' && paymentUrl) {
    lines.push('');
    lines.push('Link de pagamento:');
    lines.push(paymentUrl);
  }
  return lines.join('\n');
}

