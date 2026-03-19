'use client';

import { CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface StepPaymentConfirmationProps {
  orderId: string;
  clientName: string;
  orderAmount: number;
  frete: number;
  representanteName: string;
  invoiceNumber: string;
  paymentUrl: string;
}

export function StepPaymentConfirmation({
  orderId,
  clientName,
  orderAmount,
  frete,
  representanteName,
  invoiceNumber,
  paymentUrl,
}: StepPaymentConfirmationProps) {
  const { toast } = useToast();

  const orderNumber = `#${orderId.slice(0, 8).toUpperCase()}`;
  const totalWithFrete = orderAmount + frete;

  const handleCopy = () => {
    const lines = [
      `Pedido ${orderNumber}`,
      `Paciente: ${clientName}`,
      `Total: ${fmtBRL(totalWithFrete)}${frete > 0 ? ` (frete: ${fmtBRL(frete)})` : ''}`,
      `Representante: ${representanteName}`,
      `Invoice: ${invoiceNumber}`,
      `Link: ${paymentUrl}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Resumo copiado!' });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(paymentUrl);
    toast({ title: 'Link copiado!' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Link de pagamento criado!</h2>
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
              <p className="text-muted-foreground text-xs">Nº Invoice</p>
              <p className="font-mono font-semibold">{invoiceNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
            <div>
              <p className="text-muted-foreground text-xs">Subtotal</p>
              <p className="font-mono">{fmtBRL(orderAmount)}</p>
            </div>
            {frete > 0 && (
              <div>
                <p className="text-muted-foreground text-xs">Frete</p>
                <p className="font-mono">{fmtBRL(frete)}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="text-xl font-bold font-mono">{fmtBRL(totalWithFrete)}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-muted-foreground text-xs mb-1.5">Link de Pagamento</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs font-mono">
                {paymentUrl}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyLink}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
                <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
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
