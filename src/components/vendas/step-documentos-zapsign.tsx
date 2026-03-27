'use client';

import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { getClientRef } from '@/services/clients.service';
import { getOrderRef, updateOrder } from '@/services/orders.service';
import { generateProcuracao, generateComprovanteVinculo } from '@/server/actions/zapsign.actions';
import type { Client, Order } from '@/types';

// ─── types ───────────────────────────────────────────────────────────────────

interface StepDocumentosZapSignProps {
  orderId: string;
  clientId: string;
  clientName: string;
  anvisaOption: string;
  needsProcuracao: boolean;
  onNeedsProcuracaoChange: (v: boolean) => void;
  needsComprovanteVinculo: boolean;
  onNeedsComprovanteVinculoChange: (v: boolean) => void;
  cvSignatarioName: string;
  onCvSignatarioNameChange: (v: string) => void;
  cvSignatarioCpf: string;
  onCvSignatarioCpfChange: (v: string) => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export function StepDocumentosZapSign({
  orderId,
  clientId,
  clientName,
  anvisaOption,
  needsProcuracao,
  onNeedsProcuracaoChange,
  needsComprovanteVinculo,
  onNeedsComprovanteVinculoChange,
  cvSignatarioName,
  onCvSignatarioNameChange,
  cvSignatarioCpf,
  onCvSignatarioCpfChange,
}: StepDocumentosZapSignProps) {
  const { firestore, user } = useFirebase();

  // ── client data (for address / CPF needed by ZapSign API) ──────────────
  const clientRef = useMemoFirebase(
    () => (firestore && clientId ? getClientRef(firestore, clientId) : null),
    [firestore, clientId],
  );
  const { data: clientData } = useDoc<Client>(clientRef);

  // ── order data (to check if ZapSign docs already exist) ────────────────
  const orderRef = useMemoFirebase(
    () => (firestore && orderId ? getOrderRef(firestore, orderId) : null),
    [firestore, orderId],
  );
  const { data: orderData } = useDoc<Order>(orderRef);

  // ── loading & error state ──────────────────────────────────────────────
  const [procuracaoLoading, setProcuracaoLoading] = useState(false);
  const [procuracaoError, setProcuracaoError] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  // ── prevent double-triggering ──────────────────────────────────────────
  const hasTriggeredProcuracao = useRef(false);
  const hasTriggeredCv = useRef(false);

  // ── helpers ────────────────────────────────────────────────────────────
  const clientMissingData = !clientData?.address || !clientData?.document;

  const canGenerateProcuracao =
    needsProcuracao &&
    anvisaOption !== 'exempt' &&
    orderId &&
    !orderData?.zapsignDocId &&
    !hasTriggeredProcuracao.current &&
    !clientMissingData;

  const canGenerateCv =
    needsComprovanteVinculo &&
    orderId &&
    !orderData?.zapsignCvDocId &&
    !hasTriggeredCv.current &&
    !clientMissingData &&
    cvSignatarioName.trim() !== '' &&
    cvSignatarioCpf.trim() !== '';

  // ── generate procuração ────────────────────────────────────────────────
  const handleGenerateProcuracao = async () => {
    if (!canGenerateProcuracao || !firestore || !clientData) return;

    hasTriggeredProcuracao.current = true;
    setProcuracaoLoading(true);
    setProcuracaoError(null);

    try {
      const addr = clientData.address!;
      const result = await generateProcuracao(
        orderId,
        clientData.fullName,
        clientData.document,
        clientData.email || undefined,
        clientData.phone || undefined,
        {
          street: addr.street,
          number: addr.number,
          complement: addr.complement,
          neighborhood: addr.neighborhood,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
        },
      );

      if (result.error || !result.signUrl) {
        throw new Error(result.error || 'Link de assinatura não retornado.');
      }

      await updateOrder(firestore, orderId, {
        zapsignDocId: result.docId,
        zapsignStatus: result.status,
        zapsignSignUrl: result.signUrl,
      }, user!.uid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar procuração.';
      setProcuracaoError(msg);
      hasTriggeredProcuracao.current = false;
    } finally {
      setProcuracaoLoading(false);
    }
  };

  // ── generate comprovante de vínculo ────────────────────────────────────
  const handleGenerateCv = async () => {
    if (!canGenerateCv || !firestore || !clientData) return;

    hasTriggeredCv.current = true;
    setCvLoading(true);
    setCvError(null);

    try {
      const addr = clientData.address!;
      const result = await generateComprovanteVinculo(
        orderId,
        cvSignatarioName,
        cvSignatarioCpf,
        clientData.email || undefined,
        clientData.phone || undefined,
        {
          street: addr.street,
          number: addr.number,
          complement: addr.complement,
          neighborhood: addr.neighborhood,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
        },
        clientData.fullName,
        clientData.document,
      );

      if (result.error || !result.signUrl) {
        throw new Error(result.error || 'Link de assinatura não retornado.');
      }

      await updateOrder(firestore, orderId, {
        zapsignCvDocId: result.docId,
        zapsignCvStatus: result.status,
        zapsignCvSignUrl: result.signUrl,
      }, user!.uid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar Comprovante de Vínculo.';
      setCvError(msg);
      hasTriggeredCv.current = false;
    } finally {
      setCvLoading(false);
    }
  };

  // ── copy helpers ───────────────────────────────────────────────────────
  const [copiedProcuracao, setCopiedProcuracao] = useState(false);
  const [copiedCv, setCopiedCv] = useState(false);

  const handleCopy = (url: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(url).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  };

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Procuração toggle */}
      {anvisaOption !== 'exempt' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Procuração</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gerar procuração para assinatura via ZapSign
                </p>
              </div>
              <Switch
                checked={needsProcuracao}
                onCheckedChange={onNeedsProcuracaoChange}
                disabled={!!orderData?.zapsignDocId}
              />
            </div>

            {needsProcuracao && (
              <div className="space-y-3">
                {clientMissingData && (
                  <p className="text-sm text-amber-600">
                    ⚠ Cliente sem endereço ou CPF cadastrado. Atualize o cadastro para gerar a procuração.
                  </p>
                )}

                {!orderData?.zapsignDocId ? (
                  <div className="space-y-2">
                    <Button
                      onClick={handleGenerateProcuracao}
                      disabled={!canGenerateProcuracao || procuracaoLoading}
                      size="sm"
                    >
                      {procuracaoLoading ? 'Gerando...' : 'Gerar Procuração'}
                    </Button>
                    {procuracaoError && (
                      <p className="text-sm text-red-500">{procuracaoError}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                        ✓ Procuração gerada
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {orderData.zapsignStatus}
                      </Badge>
                    </div>
                    {orderData.zapsignSignUrl && (
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={orderData.zapsignSignUrl}
                          className="text-xs h-8 flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(orderData.zapsignSignUrl!, setCopiedProcuracao)}
                        >
                          {copiedProcuracao ? 'Copiado!' : 'Copiar'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comprovante de Vínculo toggle */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Comprovante de Vínculo</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gerar comprovante de vínculo para assinatura via ZapSign
              </p>
            </div>
            <Switch
              checked={needsComprovanteVinculo}
              onCheckedChange={onNeedsComprovanteVinculoChange}
              disabled={!!orderData?.zapsignCvDocId}
            />
          </div>

          {needsComprovanteVinculo && (
            <div className="space-y-3">
              {/* Signatário fields */}
              {!orderData?.zapsignCvDocId && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome do Signatário</Label>
                    <Input
                      placeholder="Nome completo"
                      value={cvSignatarioName}
                      onChange={(e) => onCvSignatarioNameChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CPF do Signatário</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={cvSignatarioCpf}
                      onChange={(e) => onCvSignatarioCpfChange(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {clientMissingData && (
                <p className="text-sm text-amber-600">
                  ⚠ Cliente sem endereço ou CPF cadastrado. Atualize o cadastro para gerar o comprovante.
                </p>
              )}

              {!orderData?.zapsignCvDocId ? (
                <div className="space-y-2">
                  <Button
                    onClick={handleGenerateCv}
                    disabled={!canGenerateCv || cvLoading}
                    size="sm"
                  >
                    {cvLoading ? 'Gerando...' : 'Gerar Comprovante'}
                  </Button>
                  {cvError && (
                    <p className="text-sm text-red-500">{cvError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                      ✓ Comprovante gerado
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {orderData.zapsignCvStatus}
                    </Badge>
                  </div>
                  {orderData.zapsignCvSignUrl && (
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={orderData.zapsignCvSignUrl}
                        className="text-xs h-8 flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(orderData.zapsignCvSignUrl!, setCopiedCv)}
                      >
                        {copiedCv ? 'Copiado!' : 'Copiar'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info note */}
      <p className="text-xs text-muted-foreground text-center px-4">
        {!needsProcuracao && !needsComprovanteVinculo
          ? 'Nenhum documento ZapSign necessário. Avance para enviar ao cliente.'
          : 'Gere os documentos necessários antes de avançar. Os links de assinatura serão incluídos na mensagem ao cliente.'}
      </p>
    </div>
  );
}
