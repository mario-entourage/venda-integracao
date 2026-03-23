'use client';

import React, { useState } from 'react';
import { Plane, Package, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

interface ShippingChoiceDialogProps {
  open: boolean;
  orderId: string;
  clientName: string;
  orderAmount: number;
  productSummary: string;
  onDone: () => void;
}

export function ShippingChoiceDialog({
  open,
  orderId,
  clientName,
  orderAmount,
  productSummary,
  onDone,
}: ShippingChoiceDialogProps) {
  const { toast } = useToast();
  const { user } = useFirebase();
  const [sending, setSending] = useState(false);

  const handleBrazilShip = async () => {
    setSending(true);
    try {
      const html = `
        <h2>Pedido para envio do estoque Brasil</h2>
        <p><strong>Pedido:</strong> #${orderId.slice(0, 8).toUpperCase()}</p>
        <p><strong>Cliente:</strong> ${clientName}</p>
        <p><strong>Valor:</strong> R$ ${orderAmount.toFixed(2)}</p>
        <p><strong>Produtos:</strong> ${productSummary}</p>
        <p>Por favor, providencie o envio a partir do estoque Brasil.</p>
      `;

      const idToken = await user?.getIdToken();
      if (!idToken) { toast({ variant: 'destructive', title: 'Erro', description: 'Sessão expirada. Recarregue.' }); setSending(false); return; }
      const res = await fetch('/api/notifications/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          to: 'adm@entouragelab.com',
          subject: `Envio Brasil — Pedido #${orderId.slice(0, 8).toUpperCase()} — ${clientName}`,
          html,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      toast({ title: 'E-mail enviado', description: 'Notificação de envio Brasil enviada para adm@entouragelab.com.' });
      onDone();
    } catch (err) {
      console.error('Failed to send Brazil shipping email:', err);
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao enviar e-mail de notificação.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>De onde será enviado?</DialogTitle>
          <DialogDescription>
            Escolha a origem do envio para o pedido #{orderId.slice(0, 8).toUpperCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 py-2">
          <Card
            className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
            onClick={() => {
              // Navigate to the order detail shipping step (TriStar is handled there)
              window.location.href = `/remessas?resume=${orderId}`;
            }}
          >
            <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
              <Plane className="h-7 w-7 text-primary" />
              <p className="font-semibold text-sm">TriStar Express</p>
              <p className="text-xs text-muted-foreground">
                Envio internacional de Miami
              </p>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors ${sending ? 'pointer-events-none opacity-60' : ''}`}
            onClick={handleBrazilShip}
          >
            <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
              {sending ? (
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              ) : (
                <Package className="h-7 w-7 text-primary" />
              )}
              <p className="font-semibold text-sm">Enviar do Brasil</p>
              <p className="text-xs text-muted-foreground">
                Estoque Brasil — notifica equipe
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Pular
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
