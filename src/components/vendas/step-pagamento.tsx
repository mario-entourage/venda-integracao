'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// Select removed — representante moved to Step 0
import { Switch } from '@/components/ui/switch';
import { useFirebase } from '@/firebase/provider';
import { createPaymentLink } from '@/services/payments.service';
import { updateOrder } from '@/services/orders.service';
import { generatePaymentLink } from '@/server/actions/payment.actions';

// ─── types ───────────────────────────────────────────────────────────────────

interface StepPagamentoProps {
  orderId: string;
  orderAmount: number;
  /** Currency for the payment link (default: 'BRL') */
  currency?: string;
  /** Exchange rate used (for display in the summary) */
  exchangeRate?: number;
  clientName: string;
  clientPhone: string;
  clientDocument: string;
  clientEmail: string;
  paymentUrl: string;
  gpOrderId: string;
  onPaymentGenerated: (paymentUrl: string, gpOrderId: string) => void;
  /** Frete cost (BRL) */
  frete: number;
  onFreteChange: (value: number) => void;
  /** Allowed payment methods from Step 0 (for display) */
  allowedPaymentMethods: {
    creditCard: boolean;
    debitCard: boolean;
    boleto: boolean;
    pix: boolean;
  };
  /** Whether procuração ZapSign should be generated */
  needsProcuracao: boolean;
  onNeedsProcuracaoChange: (value: boolean) => void;
  /** Whether Comprovante de Vínculo ZapSign should be generated */
  needsComprovanteVinculo: boolean;
  onNeedsComprovanteVinculoChange: (value: boolean) => void;
  /** Signatário name for Comprovante de Vínculo */
  cvSignatarioName: string;
  onCvSignatarioNameChange: (value: string) => void;
  /** Signatário CPF for Comprovante de Vínculo */
  cvSignatarioCpf: string;
  onCvSignatarioCpfChange: (value: string) => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export function StepPagamento({
  orderId,
  orderAmount,
  currency = 'BRL',
  exchangeRate,
  clientName,
  clientPhone,
  clientDocument,
  clientEmail,
  paymentUrl,
  gpOrderId,
  onPaymentGenerated,
  frete,
  onFreteChange,
  allowedPaymentMethods,
  needsProcuracao,
  onNeedsProcuracaoChange,
  needsComprovanteVinculo,
  onNeedsComprovanteVinculoChange,
  cvSignatarioName,
  onCvSignatarioNameChange,
  cvSignatarioCpf,
  onCvSignatarioCpfChange,
}: StepPagamentoProps) {
  const { firestore } = useFirebase();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [freteInput, setFreteInput] = useState(frete > 0 ? String(frete) : '');
  const hasGenerated = useRef(false);

  const totalWithFrete = orderAmount + frete;

  // Generate payment link manually (called by button after user sets frete)
  const generateLink = async () => {
    if (!orderId || hasGenerated.current) return;
    hasGenerated.current = true;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generatePaymentLink(
        orderId,
        totalWithFrete,
        currency,
        clientName || undefined,
        clientPhone || undefined,
        clientEmail || undefined,
        clientDocument || undefined,
        allowedPaymentMethods,
      );

      if (result.error || !result.paymentUrl) {
        throw new Error(result.error || 'Link de pagamento não retornado.');
      }

      // Persist the payment link in Firestore
      if (firestore) {
        const expiresAt = new Date();
        expiresAt.setHours(
          expiresAt.getHours() +
            parseInt(process.env.NEXT_PUBLIC_PAYMENT_LINK_EXPIRATION_HOURS || '24', 10),
        );

        await createPaymentLink(firestore, orderId, {
          amount: totalWithFrete,
          currency,
          referenceId: result.gpOrderId,
          paymentUrl: result.paymentUrl,
          provider: 'globalpay',
          expiresAt,
        });

        // Save frete to order document
        if (frete > 0) {
          await updateOrder(firestore, orderId, { frete });
        }
      }

      onPaymentGenerated(result.paymentUrl, result.gpOrderId);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao gerar link de pagamento.';
      setError(msg);
      hasGenerated.current = false;
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-generate on mount (or when orderId becomes available)
  useEffect(() => {
    if (!orderId || paymentUrl || hasGenerated.current) return;
    generateLink();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, paymentUrl]);

  const handleRetry = () => {
    hasGenerated.current = false;
    setError(null);
  };

  const handleCopy = () => {
    if (!paymentUrl) return;
    navigator.clipboard.writeText(paymentUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsApp = () => {
    if (!paymentUrl || !clientPhone) return;
    const phone = clientPhone.replace(/\D/g, '');
    const numberedPhone = phone.startsWith('55') ? phone : `55${phone}`;
    const text = encodeURIComponent(
      `Olá! Segue o link de pagamento para o seu pedido:\n\n${paymentUrl}\n\nO link é válido por 24 horas.`,
    );
    window.open(`https://wa.me/${numberedPhone}?text=${text}`, '_blank');
    setWhatsappSent(true);
  };

  const fmtAmount = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(v);

  const maskedPhone =
    clientPhone && clientPhone.length >= 4
      ? `(${clientPhone.slice(0, 2)}) ${clientPhone.slice(2, 3)}****-${clientPhone.slice(-4)}`
      : clientPhone || '';

  return (
    <div className="space-y-6">
      {/* Order summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pedido</span>
            <span className="font-mono text-xs">{orderId.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Paciente</span>
            <span className="font-medium">{clientName || '—'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Produtos</span>
            <span className="font-medium">{fmtAmount(orderAmount)}</span>
          </div>
          {frete > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Frete</span>
              <span className="font-medium">{fmtAmount(frete)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-sm text-muted-foreground">Valor total</span>
            <span className="text-xl font-bold text-primary">{fmtAmount(totalWithFrete)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Frete input */}
      <div className="space-y-2">
        <Label htmlFor="frete-input" className="text-sm font-semibold">Frete (R$)</Label>
        <p className="text-xs text-muted-foreground">Deixe em branco ou 0 para não adicionar frete ao link de pagamento.</p>
        <Input
          id="frete-input"
          type="number"
          min={0}
          step="0.01"
          placeholder="0,00"
          value={freteInput}
          onChange={(e) => setFreteInput(e.target.value)}
          onBlur={() => {
            const parsed = parseFloat(freteInput) || 0;
            onFreteChange(Math.max(0, parsed));
            setFreteInput(parsed > 0 ? String(parsed) : '');
          }}
          disabled={!!paymentUrl}
          className="max-w-[200px]"
        />
      </div>

      {/* Payment link section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Link de Pagamento</h3>

        {isGenerating && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent flex-shrink-0" />
            <p className="text-sm text-primary">Gerando link via GlobalPay…</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <Button
              variant="link"
              size="sm"
              className="text-red-700 underline ml-2 p-0 h-auto"
              onClick={handleRetry}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {paymentUrl && (
          <div className="space-y-3">
            {/* GP Order ID badge */}
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide shrink-0">
                  GlobalPay Link
                </span>
                {gpOrderId && (
                  <span className="rounded bg-blue-200 px-2 py-0.5 text-[11px] font-mono font-medium text-blue-800">
                    ID: {gpOrderId}
                  </span>
                )}
              </div>
            </div>

            {/* Copyable URL */}
            <div className="flex gap-2">
              <Input value={paymentUrl} readOnly className="font-mono text-sm bg-muted/40" />
              <Button variant="outline" size="sm" className="shrink-0" onClick={handleCopy}>
                {copied ? (
                  <>
                    <svg
                      className="mr-1.5 h-4 w-4 text-green-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    Copiado!
                  </>
                ) : (
                  <>
                    <svg
                      className="mr-1.5 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                      />
                    </svg>
                    Copiar
                  </>
                )}
              </Button>
            </div>

            {/* WhatsApp button */}
            {clientPhone ? (
              <Button
                variant="outline"
                className="w-full gap-2 border-green-300 text-green-700 hover:bg-green-50"
                onClick={handleWhatsApp}
              >
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Enviar via WhatsApp para {clientPhone}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Número de telefone não cadastrado. Copie o link manualmente.
              </p>
            )}

            {/* Status line */}
            {whatsappSent && clientPhone ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <svg
                  className="h-4 w-4 text-green-600 flex-shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                <p className="text-xs text-green-700">
                  Enviado via WhatsApp para {maskedPhone}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <svg
                  className="h-4 w-4 text-green-600 flex-shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                <p className="text-xs text-green-700">
                  Link de pagamento gerado com sucesso. Válido por 24 horas.
                </p>
              </div>
            )}
          </div>
        )}

        {!isGenerating && !paymentUrl && !error && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aguardando geração do link…
          </p>
        )}
      </div>

      {/* ZapSign document toggles — shown after payment link is generated */}
      {paymentUrl && (
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold">Documentos ZapSign</h3>

          {/* Procuração toggle */}
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Procuração ANVISA</p>
              <p className="text-xs text-muted-foreground">Gerar procuração ANVISA para assinatura via ZapSign?</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{needsProcuracao ? 'SIM' : 'NÃO'}</span>
              <Switch checked={needsProcuracao} onCheckedChange={onNeedsProcuracaoChange} />
            </div>
          </div>

          {/* Comprovante de Vínculo toggle */}
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Comprovante de Vínculo</p>
              <p className="text-xs text-muted-foreground">Gerar Comprovante de Vínculo para assinatura via ZapSign?</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{needsComprovanteVinculo ? 'SIM' : 'NÃO'}</span>
              <Switch checked={needsComprovanteVinculo} onCheckedChange={onNeedsComprovanteVinculoChange} />
            </div>
          </div>

          {/* Signatário fields — shown when Comprovante is enabled */}
          {needsComprovanteVinculo && (
            <div className="rounded-lg border px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Dados do Signatário (quem assina o comprovante)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="cv-signatario-name" className="text-sm">Nome Completo do Signatário</Label>
                  <Input
                    id="cv-signatario-name"
                    placeholder="Nome do signatário"
                    value={cvSignatarioName}
                    onChange={(e) => onCvSignatarioNameChange(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cv-signatario-cpf" className="text-sm">CPF do Signatário</Label>
                  <Input
                    id="cv-signatario-cpf"
                    placeholder="000.000.000-00"
                    value={cvSignatarioCpf}
                    onChange={(e) => onCvSignatarioCpfChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
