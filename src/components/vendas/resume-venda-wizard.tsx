'use client';

import React, { useState, useEffect } from 'react';
import { getDoc, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import {
  getOrderRef,
  getOrderSubcollectionRef,
  updateOrderStatus,
} from '@/services/orders.service';
import { StepWizard } from '@/components/shared/step-wizard';
import { StepPagamento } from './step-pagamento';
import { StepDocumentosZapSign } from './step-documentos-zapsign';
import { StepEnviarCliente } from './step-enviar-cliente';
import type { Order, OrderCustomer, OrderDoctor } from '@/types';

// ─── constants ────────────────────────────────────────────────────────────────

const RESUME_STEPS = [
  { label: 'Pagamento', description: 'Gerar link GlobalPay' },
  { label: 'Documentos ZapSign', description: 'Procuração e Comprovante' },
  { label: 'Enviar ao Cliente', description: 'Enviar links ao cliente' },
];

// ─── props ────────────────────────────────────────────────────────────────────

interface ResumeVendaWizardProps {
  orderId: string;
  onComplete: () => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export function ResumeVendaWizard({ orderId, onComplete }: ResumeVendaWizardProps) {
  const { firestore, user } = useFirebase();

  // ── data loading ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [doctor, setDoctor] = useState<OrderDoctor | null>(null);

  useEffect(() => {
    if (!firestore || !orderId) return;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      getDoc(getOrderRef(firestore, orderId)),
      getDocs(getOrderSubcollectionRef(firestore, orderId, 'customer')),
      getDocs(getOrderSubcollectionRef(firestore, orderId, 'doctor')),
    ])
      .then(([orderSnap, customerSnap, doctorSnap]) => {
        if (!orderSnap.exists()) {
          setLoadError('Pedido não encontrado.');
          setLoading(false);
          return;
        }
        setOrder({ id: orderSnap.id, ...orderSnap.data() } as Order);
        setCustomer(
          customerSnap.docs[0]
            ? ({ id: customerSnap.docs[0].id, ...customerSnap.docs[0].data() } as unknown as OrderCustomer)
            : null,
        );
        setDoctor(
          doctorSnap.docs[0]
            ? ({ id: doctorSnap.docs[0].id, ...doctorSnap.docs[0].data() } as unknown as OrderDoctor)
            : null,
        );
        setLoading(false);
      })
      .catch((err) => {
        console.error('[ResumeVendaWizard] load error:', err);
        setLoadError('Erro ao carregar pedido. Tente novamente.');
        setLoading(false);
      });
  }, [firestore, orderId]);

  // ── wizard state ────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [gpOrderId, setGpOrderId] = useState('');
  const [_invoiceNumber, setInvoiceNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ZapSign toggles
  const [needsProcuracao, setNeedsProcuracao] = useState(false);
  const [needsComprovanteVinculo, setNeedsComprovanteVinculo] = useState(false);
  const [cvSignatarioName, setCvSignatarioName] = useState('');
  const [cvSignatarioCpf, setCvSignatarioCpf] = useState('');

  // ── completion ──────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!firestore || !user) return;
    setIsSubmitting(true);
    try {
      await updateOrderStatus(firestore, orderId, 'processing', user.uid);
      onComplete();
    } catch (err) {
      console.error('[ResumeVendaWizard] finalization error:', err);
      setSubmitError('Erro ao finalizar pedido. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  // ── loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 rounded-lg bg-muted animate-pulse" />
        <div className="h-40 rounded-lg bg-muted animate-pulse" />
        <div className="h-10 w-full rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  const canAdvance = (() => {
    if (isSubmitting) return false;
    if (currentStep === 0) return paymentUrl !== '';
    if (currentStep === 1) return true; // ZapSign optional
    return true; // step 2 — always allow finalize
  })();

  return (
    <div className="space-y-4">
      {/* Order banner */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Retomando pedido </span>
        <span className="font-mono font-medium">#{orderId.slice(0, 8).toUpperCase()}</span>
        {customer?.name && (
          <>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium">{customer.name}</span>
          </>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <StepWizard
        steps={RESUME_STEPS}
        currentStep={currentStep}
        onStepChange={(s) => setCurrentStep(s)}
        onComplete={handleComplete}
        canAdvance={canAdvance}
        canGoBack={!isSubmitting && currentStep > 0}
        completeLabel={isSubmitting ? 'Finalizando…' : 'Finalizar Venda'}
      >
        {currentStep === 0 && (
          <StepPagamento
            orderId={orderId}
            orderAmount={order?.amount ?? 0}
            currency={order?.currency || 'BRL'}
            exchangeRate={order?.exchangeRate}
            clientName={customer?.name ?? ''}
            clientPhone=""
            clientDocument={customer?.document ?? ''}
            clientEmail=""
            paymentUrl={paymentUrl}
            gpOrderId={gpOrderId}
            onPaymentGenerated={(url, gpId, invoice) => {
              setPaymentUrl(url);
              setGpOrderId(gpId);
              setInvoiceNumber(invoice ?? '');
            }}
            allowedPaymentMethods={{ creditCard: true, debitCard: true, boleto: true, pix: true }}
            frete={0}
          />
        )}

        {currentStep === 1 && (
          <StepDocumentosZapSign
            orderId={orderId}
            clientId={customer?.userId ?? ''}
            clientName={customer?.name ?? ''}
            anvisaOption={(order?.anvisaOption as string) ?? 'regular'}
            needsProcuracao={needsProcuracao}
            onNeedsProcuracaoChange={setNeedsProcuracao}
            needsComprovanteVinculo={needsComprovanteVinculo}
            onNeedsComprovanteVinculoChange={setNeedsComprovanteVinculo}
            cvSignatarioName={cvSignatarioName}
            onCvSignatarioNameChange={setCvSignatarioName}
            cvSignatarioCpf={cvSignatarioCpf}
            onCvSignatarioCpfChange={setCvSignatarioCpf}
          />
        )}

        {currentStep === 2 && (
          <StepEnviarCliente
            orderId={orderId}
            clientName={customer?.name ?? ''}
            clientPhone=""
            paymentUrl={paymentUrl}
          />
        )}
      </StepWizard>
    </div>
  );
}
