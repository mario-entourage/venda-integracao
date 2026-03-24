'use client';

import { CheckCircle2, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { ProductLine } from './nova-venda-wizard';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface StepOrderConfirmationProps {
  orderId: string;
  clientName: string;
  doctorName: string;
  doctorCrm: string;
  products: ProductLine[];
  orderAmount: number;
  frete: number;
  representanteName: string;
}

export function StepOrderConfirmation({
  orderId,
  clientName,
  doctorName,
  doctorCrm,
  products,
  orderAmount,
  frete,
  representanteName,
}: StepOrderConfirmationProps) {
  const { toast } = useToast();

  const orderNumber = `#${orderId.slice(0, 8).toUpperCase()}`;

  const totalWithFrete = orderAmount + frete;

  const handleCopy = () => {
    const productLines = products
      .map((p) => `  ${p.productName} x${p.quantity} — ${fmtBRL(p.negotiatedPrice * p.quantity)}`)
      .join('\n');

    const text = [
      `Pedido ${orderNumber}`,
      `Paciente: ${clientName}`,
      `Médico: ${doctorName}${doctorCrm ? ` (CRM: ${doctorCrm})` : ''}`,
      `Produtos:\n${productLines}`,
      `Total: ${fmtBRL(totalWithFrete)}${frete > 0 ? ` (frete: ${fmtBRL(frete)})` : ''}`,
      `Representante: ${representanteName}`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    toast({ title: 'Resumo copiado!' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Pedido criado com sucesso!</h2>
          <p className="text-sm text-muted-foreground">Confira os dados antes de prosseguir.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Nº do Pedido</p>
              <p className="font-mono font-semibold">{orderNumber}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Representante</p>
              <p className="font-medium">{representanteName}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Paciente / Cliente</p>
              <p className="font-medium">{clientName}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Médico Prescritor</p>
              <p className="font-medium">{doctorName}{doctorCrm ? ` (CRM: ${doctorCrm})` : ''}</p>
            </div>
          </div>

          <div>
            <p className="text-muted-foreground text-xs mb-2">Produtos</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Produto</TableHead>
                  <TableHead className="text-xs text-center">Qtd</TableHead>
                  <TableHead className="text-xs text-right">Preço Unit.</TableHead>
                  <TableHead className="text-xs text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.productName}</TableCell>
                    <TableCell className="text-sm text-center">{p.quantity}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{fmtBRL(p.negotiatedPrice)}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{fmtBRL(p.negotiatedPrice * p.quantity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              {frete > 0 && (
                <div className="mb-1 flex gap-6 text-sm">
                  <span className="text-muted-foreground">Subtotal: <span className="font-mono">{fmtBRL(orderAmount)}</span></span>
                  <span className="text-muted-foreground">Frete: <span className="font-mono">{fmtBRL(frete)}</span></span>
                </div>
              )}
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="text-xl font-bold font-mono">{fmtBRL(totalWithFrete)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Copiar Resumo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
