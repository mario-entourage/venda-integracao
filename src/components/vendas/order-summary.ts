import type { Step1State } from './step-identificacao';
import type { ProductLine } from './nova-venda-wizard';

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatOrderShortId(orderId: string): string {
  return '#' + orderId.slice(0, 8).toUpperCase();
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
  const { kind, orderId, invoiceNumber, paymentUrl, repName, step1, products, subtotal, frete, total } = params;

  const lines: string[] = [];
  lines.push(`*${kind === 'pedido' ? 'Confirmação de Pedido' : 'Confirmação de Pagamento'}*`);
  lines.push(`Pedido: ${formatOrderShortId(orderId)}${invoiceNumber ? ' | ' + invoiceNumber : ''}`);
  if (repName) lines.push(`Representante: ${repName}`);
  lines.push('');
  lines.push(`Paciente: ${step1.clientName || '—'}`);
  if (step1.clientDocument) lines.push(`Documento: ${step1.clientDocument}`);
  if (step1.clientPhone) lines.push(`Telefone: ${step1.clientPhone}`);
  lines.push('');
  lines.push('*Produtos:*');
  for (const p of products) {
    lines.push(`• ${p.productName} x${p.quantity} — ${formatCurrencyBRL(p.negotiatedPrice * p.quantity)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${formatCurrencyBRL(subtotal)}`);
  if (frete > 0) lines.push(`Frete: ${formatCurrencyBRL(frete)}`);
  lines.push(`Total: ${formatCurrencyBRL(total)}`);
  if (kind === 'pagamento' && paymentUrl) {
    lines.push('');
    lines.push(`Link de pagamento: ${paymentUrl}`);
  }

  return lines.join('\n');
}
