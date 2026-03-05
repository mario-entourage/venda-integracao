'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { getOrderRef } from '@/services/orders.service';
import type { Order } from '@/types';

// ─── types ───────────────────────────────────────────────────────────────────

interface StepEnviarClienteProps {
  orderId: string;
  clientName: string;
  clientPhone: string;
  paymentUrl: string;
}

// ─── component ───────────────────────────────────────────────────────────────

export function StepEnviarCliente({
  orderId,
  clientName,
  clientPhone,
  paymentUrl,
}: StepEnviarClienteProps) {
  const { firestore } = useFirebase();

  // ── subscribe to order to get ZapSign URLs ─────────────────────────────
  const orderRef = useMemoFirebase(
    () => (firestore && orderId ? getOrderRef(firestore, orderId) : null),
    [firestore, orderId],
  );
  const { data: orderData } = useDoc<Order>(orderRef);

  const zapsignSignUrl = orderData?.zapsignSignUrl || undefined;
  const zapsignCvSignUrl = orderData?.zapsignCvSignUrl || undefined;

  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedPayment, setCopiedPayment] = useState(false);
  const [copiedProcuracao, setCopiedProcuracao] = useState(false);
  const [copiedCv, setCopiedCv] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

  // ── build the full message ─────────────────────────────────────────────
  const buildMessage = () => {
    const lines: string[] = [];
    lines.push(`Olá${clientName ? `, ${clientName}` : ''}!`);
    lines.push('');
    lines.push('Seguem os links referentes ao seu pedido:');
    lines.push('');

    if (paymentUrl) {
      lines.push('Link de pagamento:');
      lines.push(paymentUrl);
      lines.push('');
    }

    if (zapsignSignUrl) {
      lines.push('Procuração para assinatura:');
      lines.push(zapsignSignUrl);
      lines.push('');
    }

    if (zapsignCvSignUrl) {
      lines.push('Comprovante de Vínculo para assinatura:');
      lines.push(zapsignCvSignUrl);
      lines.push('');
    }

    lines.push('Por favor, complete as etapas acima o mais rápido possível.');
    lines.push('Qualquer dúvida, estamos à disposição!');

    return lines.join('\n');
  };

  // ── copy a single URL ──────────────────────────────────────────────────
  const handleCopy = (url: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(url).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  };

  // ── copy all links ─────────────────────────────────────────────────────
  const handleCopyAll = () => {
    const message = buildMessage();
    navigator.clipboard.writeText(message).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  };

  // ── WhatsApp share ─────────────────────────────────────────────────────
  const handleWhatsApp = () => {
    if (!clientPhone) return;
    const phone = clientPhone.replace(/\D/g, '');
    const numberedPhone = phone.startsWith('55') ? phone : `55${phone}`;
    const text = encodeURIComponent(buildMessage());
    window.open(`https://wa.me/${numberedPhone}?text=${text}`, '_blank');
    setWhatsappSent(true);
  };

  // ── check if there's anything to send ──────────────────────────────────
  const hasLinks = !!(paymentUrl || zapsignSignUrl || zapsignCvSignUrl);

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Resumo — Links para o cliente</Label>
            <p className="text-xs text-muted-foreground">
              Revise os links gerados e envie ao cliente.
            </p>
          </div>

          {/* Payment link */}
          {paymentUrl ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Link de Pagamento</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={paymentUrl} className="text-xs h-8 flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(paymentUrl, setCopiedPayment)}
                >
                  {copiedPayment ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                Pagamento não gerado
              </Badge>
            </div>
          )}

          {/* Procuração sign URL */}
          {zapsignSignUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Procuração — Assinatura</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={zapsignSignUrl} className="text-xs h-8 flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(zapsignSignUrl, setCopiedProcuracao)}
                >
                  {copiedProcuracao ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </div>
          )}

          {/* Comprovante de Vínculo sign URL */}
          {zapsignCvSignUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Comprovante de Vínculo — Assinatura</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={zapsignCvSignUrl} className="text-xs h-8 flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(zapsignCvSignUrl, setCopiedCv)}
                >
                  {copiedCv ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      {hasLinks && (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={handleCopyAll} className="gap-2">
            {copiedAll ? '✓ Copiado!' : 'Copiar tudo'}
          </Button>

          {clientPhone && (
            <Button
              onClick={handleWhatsApp}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {whatsappSent ? '✓ WhatsApp enviado' : 'Enviar por WhatsApp'}
            </Button>
          )}
        </div>
      )}

      {!hasLinks && (
        <p className="text-sm text-center text-muted-foreground">
          Nenhum link foi gerado. Volte aos passos anteriores para gerar o link de pagamento.
        </p>
      )}

      {/* Final note */}
      <p className="text-xs text-muted-foreground text-center px-4">
        Ao finalizar, o pedido ficará com status &quot;Processando&quot;.
        Acompanhe as respostas do cliente na página de detalhe do pedido.
      </p>
    </div>
  );
}
