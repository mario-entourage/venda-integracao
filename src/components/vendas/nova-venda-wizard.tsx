'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getActiveClientsQuery } from '@/services/clients.service';
import { getActiveDoctorsQuery } from '@/services/doctors.service';
import { getActiveProductsQuery } from '@/services/products.service';
import { getActiveRepresentantesQuery } from '@/services/representantes.service';
import { getActiveRepUsersQuery } from '@/services/users.service';
import { getUnassignedPaymentLinksQuery } from '@/services/payments.service';
import { assignPaymentToOrder } from '@/server/actions/payment.actions';
import { createOrder, updateOrderRepresentative, findActiveOrderByPrescriptionHash } from '@/services/orders.service';
import { createOrderDocumentRequest, updateDocumentRequestStatus } from '@/services/documents.service';
import { updateOrderStatus } from '@/services/orders.service';
import { BASE_LABELS } from '@/lib/order-status-helpers';
import { savePrescription } from '@/services/prescriptions.service';
import { StepWizard } from '@/components/shared/step-wizard';
import { StepIdentificacao, type Step1State } from './step-identificacao';
import { StepPagamento } from './step-pagamento';
import { StepDocumentosZapSign } from './step-documentos-zapsign';
import { StepEnviarCliente } from './step-enviar-cliente';
import { StepEnvio } from './step-envio';
import { PostWizardDialog } from './post-wizard-dialog';
import { getPtaxRate } from '@/server/actions/ptax.actions';
import type { Client, Doctor, Product, User, Representante, PaymentLink } from '@/types';

// ─── types ───────────────────────────────────────────────────────────────────

export interface ProductLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  /** Original list price from the product catalogue */
  listPrice: number;
  /** Price the sales rep negotiated — drives the discount */
  negotiatedPrice: number;
  /** Auto-computed: (listPrice - negotiatedPrice) / listPrice * 100 */
  discount: number;
  aiHintName?: string;
}

interface WizardState {
  // Step 1
  step1: Step1State;
  // Created after step 1 submit
  orderId: string;
  orderAmount: number;
  // Step 2
  paymentUrl: string;
  gpOrderId: string;
  // Representative (selected in step 1 — Identificação)
  selectedRepresentanteId: string;
  selectedRepresentanteName: string;
  // ZapSign toggles (selected in step 2 — Pagamento)
  needsProcuracao: boolean;
  needsComprovanteVinculo: boolean;
  // Comprovante de Vínculo — Signatário info
  cvSignatarioName: string;
  cvSignatarioCpf: string;
  // Pre-assigned standalone payment (admin-only, selected in step 0)
  assignedPaymentId: string;
  assignedPaymentUrl: string;
  assignedPaymentInvoice: string;
  assignedPaymentAmount: number;
  // Frete (entered in step 0 — Identificação; included in GlobalPay link amount)
  frete: number;
  // PTAX exchange rate (fetched once on mount)
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateLoading: boolean;
  exchangeRateError: string | null;
}

const INITIAL_STEP1: Step1State = {
  clientId: '',
  clientName: '',
  clientDocument: '',
  clientPhone: '',
  clientIsNew: false,
  doctorId: '',
  doctorName: '',
  doctorCrm: '',
  doctorIsNew: false,
  prescriptionFile: null,
  prescriptionFileName: '',
  prescriptionHash: '',
  prescriptionDate: '',
  products: [],
  anvisaOption: 'regular',
  allowedPaymentMethods: { creditCard: true, debitCard: true, boleto: true, pix: true },
};

const INITIAL_STATE: WizardState = {
  step1: INITIAL_STEP1,
  orderId: '',
  orderAmount: 0,
  paymentUrl: '',
  gpOrderId: '',
  selectedRepresentanteId: '',
  selectedRepresentanteName: 'Venda Direta',
  needsProcuracao: false,
  needsComprovanteVinculo: false,
  cvSignatarioName: '',
  cvSignatarioCpf: '',
  assignedPaymentId: '',
  assignedPaymentUrl: '',
  assignedPaymentInvoice: '',
  assignedPaymentAmount: 0,
  frete: 0,
  exchangeRate: 0,
  exchangeRateDate: '',
  exchangeRateLoading: true,
  exchangeRateError: null,
};

const STEPS = [
  { label: 'Identificação', description: 'Paciente, médico e produtos' },
  { label: 'Pagamento', description: 'Gerar link GlobalPay' },
  { label: 'Documentos ZapSign', description: 'Procuração e Comprovante' },
  { label: 'Enviar ao Cliente', description: 'Enviar links ao cliente' },
  { label: 'Envio', description: 'Método de entrega' },
];

// ─── component ───────────────────────────────────────────────────────────────

interface NovaVendaWizardProps {
  onComplete: (orderId: string) => void;
}

export function NovaVendaWizard({ onComplete }: NovaVendaWizardProps) {
  const router = useRouter();
  const { firestore, storage, user, isAdmin } = useFirebase();

  // ── Firebase data ───────────────────────────────────────────────────────
  const clientsQ = useMemoFirebase(
    () => (firestore ? getActiveClientsQuery(firestore) : null),
    [firestore],
  );
  const doctorsQ = useMemoFirebase(
    () => (firestore ? getActiveDoctorsQuery(firestore) : null),
    [firestore],
  );
  const productsQ = useMemoFirebase(
    () => (firestore ? getActiveProductsQuery(firestore) : null),
    [firestore],
  );
  const repUsersQ = useMemoFirebase(
    () => (firestore ? getActiveRepUsersQuery(firestore) : null),
    [firestore],
  );

  // Unassigned standalone payments (admin only)
  const unassignedQ = useMemoFirebase(
    () => (firestore && isAdmin ? getUnassignedPaymentLinksQuery(firestore) : null),
    [firestore, isAdmin],
  );

  const { data: clients } = useCollection<Client>(clientsQ);
  const { data: doctors } = useCollection<Doctor>(doctorsQ);
  const { data: products } = useCollection<Product>(productsQ);
  const { data: repUsers } = useCollection<User>(repUsersQ);
  const { data: unassignedPayments } = useCollection<PaymentLink>(unassignedQ);

  // ── wizard state ────────────────────────────────────────────────────────
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** When a duplicate prescription is detected, store the existing order ID for linking. */
  const [duplicateOrderId, setDuplicateOrderId] = useState<string | null>(null);
  /** Admin override: allow creating an order with a duplicate prescription. */
  const [adminOverrideDuplicate, setAdminOverrideDuplicate] = useState(false);
  // Post-completion dialog: shown when one or both entities were quick-added
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState('');

  // ── fetch PTAX exchange rate on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getPtaxRate().then((result) => {
      if (cancelled) return;
      if (result.error || result.midRate === 0) {
        setState((prev) => ({
          ...prev,
          exchangeRateLoading: false,
          exchangeRateError: result.error || 'Cotação PTAX indisponível.',
        }));
      } else {
        setState((prev) => ({
          ...prev,
          exchangeRate: result.midRate,
          exchangeRateDate: result.queryDate,
          exchangeRateLoading: false,
          exchangeRateError: null,
        }));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const updateStep1 = useCallback((changes: Partial<Step1State>) => {
    setState((prev) => ({ ...prev, step1: { ...prev.step1, ...changes } }));
  }, []);

  // Clear duplicate-prescription error when the user swaps the file
  useEffect(() => {
    if (duplicateOrderId) {
      setDuplicateOrderId(null);
      setSubmitError(null);
      setAdminOverrideDuplicate(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step1.prescriptionFile]);

  // ── step 1 validation ───────────────────────────────────────────────────
  // listPrice === 0 is valid (TBD-priced products); prescriptionFile is optional
  // (the upload step writes '' when absent — no Firestore validation requires it).
  const step1Valid =
    state.step1.clientId !== '' &&
    state.step1.doctorId !== '' &&
    state.step1.products.length > 0 &&
    state.step1.products.every((p) => p.productId !== '' && p.quantity > 0);

  // ── upload prescription helper ──────────────────────────────────────────
  async function uploadPrescription(file: File): Promise<string> {
    const path = `documents/prescriptions/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    // Race against a 15-second timeout so CORS / network failures don't hang forever
    const uploadPromise = new Promise<void>((resolve, reject) => {
      task.on('state_changed', null, reject, resolve);
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        task.cancel();
        reject(new Error('Upload timed out after 15 s'));
      }, 15_000),
    );
    await Promise.race([uploadPromise, timeout]);

    await getDownloadURL(task.snapshot.ref);
    return path;
  }

  // ── step transition ─────────────────────────────────────────────────────
  const handleStepChange = async (newStep: number) => {
    if (newStep < currentStep) {
      setCurrentStep(newStep);
      return;
    }

    // Advancing from step 0 → 1: create order
    if (currentStep === 0 && newStep === 1) {
      if (!step1Valid || !firestore || !user) return;
      setIsSubmitting(true);
      setSubmitError(null);
      setDuplicateOrderId(null);

      try {
        const { step1 } = state;

        // ── Duplicate prescription check ────────────────────────────────
        if (step1.prescriptionHash && firestore && !adminOverrideDuplicate) {
          const existing = await findActiveOrderByPrescriptionHash(
            firestore,
            step1.prescriptionHash,
          );
          if (existing) {
            const statusLabel = BASE_LABELS[existing.status] || existing.status;
            setSubmitError(
              `Esta receita já está vinculada à venda #${existing.id.slice(0, 8).toUpperCase()} ` +
              `(status: ${statusLabel}). Cancele essa venda primeiro para reutilizar a receita.`,
            );
            setDuplicateOrderId(existing.id);
            setIsSubmitting(false);
            return;
          }
        }

        // Upload prescription (non-fatal — if it fails, we still create the order)
        let prescriptionPath = '';
        if (step1.prescriptionFile && storage) {
          try {
            prescriptionPath = await uploadPrescription(step1.prescriptionFile);
          } catch (uploadErr) {
            console.warn('Prescription upload failed (continuing):', uploadErr);
          }
        }

        // Calculate amount
        const amount = step1.products.reduce(
          (sum, p) => sum + p.negotiatedPrice * p.quantity,
          0,
        );

        console.log('[wizard] Creating order…', {
          client: step1.clientName,
          doctor: step1.doctorName,
          productCount: step1.products.length,
          amount,
        });

        // Create order with the selected representative (or default "Venda Direta")
        const orderId = await createOrder(
          firestore,
          {
            customer: {
              name: step1.clientName,
              document: step1.clientDocument,
              userId: step1.clientId,
            },
            representative: {
              name: state.selectedRepresentanteName,
              userId: state.selectedRepresentanteId,
            },
            doctor: {
              name: step1.doctorName,
              crm: step1.doctorCrm,
              userId: step1.doctorId,
            },
            products: step1.products.map((p) => ({
              stockProductId: p.productId,
              quantity: p.quantity,
              price: p.listPrice,      // USD list price from catalog (for auditing)
              discount: p.discount,
              productName: p.productName,
            })),
            currency: 'BRL',
            amountOverride: amount,    // BRL total (negotiated prices are already in BRL)
            exchangeRate: state.exchangeRate,
            exchangeRateDate: state.exchangeRateDate,
            anvisaOption: step1.anvisaOption as 'regular' | 'exceptional' | 'exempt',
            prescriptionDocId: prescriptionPath,
            prescriptionHash: step1.prescriptionHash,
            prescriptionDate: step1.prescriptionDate,
            allowedPaymentMethods: step1.allowedPaymentMethods,
          },
          user.uid,
        );

        console.log('[wizard] Order created:', orderId);

        // Create document requests (non-fatal)
        try {
          const docTypes = ['identity', 'proof_of_address', 'prescription'];
          if (step1.anvisaOption !== 'exempt') {
            docTypes.push('anvisa_authorization');
          }
          const docIds = await Promise.all(
            docTypes.map((t) => createOrderDocumentRequest(firestore, orderId, t)),
          );

          // If the user provided a prescription in Step 1 (even if Storage upload
          // timed out), mark the document request as received immediately.
          if (step1.prescriptionFile || prescriptionPath) {
            const prescIdx = docTypes.indexOf('prescription');
            if (prescIdx !== -1) {
              await updateDocumentRequestStatus(firestore, orderId, docIds[prescIdx], 'received');
            }
          }
        } catch (docErr) {
          console.warn('Document requests creation failed (continuing):', docErr);
        }

        // Save prescription record to `prescriptions` collection (non-fatal)
        try {
          await savePrescription(firestore, {
            prescriptionDate: step1.prescriptionDate || null,
            clientId: step1.clientId,
            doctorId: step1.doctorId,
            orderId,
            prescriptionPath,
            products: step1.products.map((p) => ({
              productId: p.productId,
              productName: p.productName,
              quantity: p.quantity,
              negotiatedTotalPrice: parseFloat((p.negotiatedPrice * p.quantity).toFixed(2)),
            })),
          });
          console.log('[wizard] Prescription record saved.');
        } catch (presErr) {
          console.warn('Prescription record creation failed (continuing):', presErr);
        }

        // If admin pre-assigned an unassigned payment, move it to this order now
        if (state.assignedPaymentId) {
          try {
            const assignResult = await assignPaymentToOrder(state.assignedPaymentId, orderId);
            if (assignResult.ok) {
              console.log('[wizard] Standalone payment assigned to order:', state.assignedPaymentInvoice);
              setState((prev) => ({
                ...prev,
                orderId,
                orderAmount: amount,
                paymentUrl: prev.assignedPaymentUrl,
                gpOrderId: prev.assignedPaymentId,
              }));
            } else {
              console.warn('[wizard] Payment assignment failed:', assignResult.error);
              setState((prev) => ({ ...prev, orderId, orderAmount: amount }));
            }
          } catch (assignErr) {
            console.warn('[wizard] Payment assignment error (continuing):', assignErr);
            setState((prev) => ({ ...prev, orderId, orderAmount: amount }));
          }
        } else {
          setState((prev) => ({ ...prev, orderId, orderAmount: amount }));
        }
        setCurrentStep(1);
      } catch (err) {
        console.error('Order creation error:', err);
        const msg =
          err instanceof Error ? err.message : 'Erro desconhecido';
        setSubmitError(`Erro ao criar pedido: ${msg}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setCurrentStep(newStep);
  };

  // ── representante selection ─────────────────────────────────────────────
  const handleRepresentanteChange = useCallback(
    async (id: string, name: string) => {
      setState((prev) => ({
        ...prev,
        selectedRepresentanteId: id,
        selectedRepresentanteName: name,
      }));

      // Persist to Firestore immediately (non-fatal)
      if (firestore && state.orderId) {
        try {
          await updateOrderRepresentative(firestore, state.orderId, { name, userId: id });
          console.log('[wizard] Representative updated:', name);
        } catch (err) {
          console.warn('[wizard] Representative update failed (non-fatal):', err);
        }
      }
    },
    [firestore, state.orderId],
  );

  // ── completion (step 2 → finalize) ─────────────────────────────────────
  const handleComplete = async () => {
    if (!state.orderId || !firestore || !user) return;
    setIsSubmitting(true);
    try {
      await updateOrderStatus(firestore, state.orderId, 'processing', user.uid);
      onComplete(state.orderId);

      // If any entity was quick-added, pause navigation and show the
      // supplementary-info dialog before proceeding to the order page.
      if (state.step1.clientIsNew || state.step1.doctorIsNew) {
        setCompletedOrderId(state.orderId);
        setShowPostDialog(true);
      } else {
        router.push(`/controle/${state.orderId}`);
      }
    } catch (err) {
      console.error('Order finalization error:', err);
      setSubmitError('Erro ao finalizar pedido. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  // Called when PostWizardDialog is dismissed (save or skip)
  const handlePostDialogDone = () => {
    setShowPostDialog(false);
    router.push(`/controle/${completedOrderId}`);
  };

  // ── step can-advance logic ──────────────────────────────────────────────
  const canAdvance = (() => {
    if (isSubmitting) return false;
    if (currentStep === 0) return step1Valid && state.exchangeRate > 0;
    if (currentStep === 1) return state.paymentUrl !== '';
    if (currentStep === 2) return true; // ZapSign — always allow advance (optional)
    return true; // steps 3 and 4 — always allow (skippable)
  })();

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Post-completion supplementary info dialog */}
      <PostWizardDialog
        open={showPostDialog}
        onDone={handlePostDialogDone}
        clientId={state.step1.clientId}
        clientName={state.step1.clientName}
        clientIsNew={state.step1.clientIsNew}
        doctorId={state.step1.doctorId}
        doctorName={state.step1.doctorName}
        doctorIsNew={state.step1.doctorIsNew}
      />
      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{submitError}</p>
          {duplicateOrderId && (
            <div className="mt-2 space-y-2">
              <Link
                href={`/controle/${duplicateOrderId}`}
                className="inline-block font-medium underline text-red-800 hover:text-red-900"
              >
                Ver venda existente →
              </Link>
              {isAdmin && (
                <label className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminOverrideDuplicate}
                    onChange={(e) => setAdminOverrideDuplicate(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-semibold text-amber-800">
                    Admin: Permitir receita duplicada e prosseguir
                  </span>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      <StepWizard
        steps={STEPS}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onComplete={handleComplete}
        canAdvance={canAdvance}
        canGoBack={!isSubmitting && currentStep > 0 && state.orderId === ''}
        completeLabel={isSubmitting ? 'Finalizando…' : 'Finalizar Venda'}
      >
        {currentStep === 0 && (
          <StepIdentificacao
            state={state.step1}
            onChange={updateStep1}
            clients={clients ?? []}
            doctors={doctors ?? []}
            allProducts={products ?? []}
            exchangeRate={state.exchangeRate}
            exchangeRateLoading={state.exchangeRateLoading}
            exchangeRateError={state.exchangeRateError}
            exchangeRateDate={state.exchangeRateDate}
            repUsers={repUsers ?? []}
            selectedRepresentanteId={state.selectedRepresentanteId}
            onRepresentanteChange={handleRepresentanteChange}
            frete={state.frete}
            onFreteChange={(v) => setState((prev) => ({ ...prev, frete: v }))}
            isAdmin={isAdmin}
            unassignedPayments={unassignedPayments ?? []}
            selectedUnassignedPaymentId={state.assignedPaymentId}
            onUnassignedPaymentSelect={(id, payment) => {
              setState((prev) => ({
                ...prev,
                assignedPaymentId: id,
                assignedPaymentUrl: payment?.paymentUrl ?? '',
                assignedPaymentInvoice: payment?.invoice ?? '',
                assignedPaymentAmount: payment?.amount ?? 0,
              }));
            }}
          />
        )}

        {currentStep === 1 && (
          <StepPagamento
            orderId={state.orderId}
            orderAmount={state.orderAmount}
            currency="BRL"
            exchangeRate={state.exchangeRate}
            clientName={state.step1.clientName}
            clientPhone={state.step1.clientPhone}
            clientDocument={state.step1.clientDocument}
            clientEmail=""
            paymentUrl={state.paymentUrl}
            gpOrderId={state.gpOrderId}
            onPaymentGenerated={(paymentUrl, gpOrderId) =>
              setState((prev) => ({ ...prev, paymentUrl, gpOrderId }))
            }
            frete={state.frete}
            allowedPaymentMethods={state.step1.allowedPaymentMethods}
            repDisplayName={state.selectedRepresentanteName !== 'Venda Direta' ? state.selectedRepresentanteName : undefined}
            repUserId={state.selectedRepresentanteId || undefined}
            repEmail={(repUsers ?? []).find((r) => r.id === state.selectedRepresentanteId)?.email}
            preAssignedInvoice={state.assignedPaymentInvoice}
            preAssignedAmount={state.assignedPaymentAmount}
          />
        )}

        {currentStep === 2 && (
          <StepDocumentosZapSign
            orderId={state.orderId}
            clientId={state.step1.clientId}
            clientName={state.step1.clientName}
            anvisaOption={state.step1.anvisaOption}
            needsProcuracao={state.needsProcuracao}
            onNeedsProcuracaoChange={(v) => setState((prev) => ({ ...prev, needsProcuracao: v }))}
            needsComprovanteVinculo={state.needsComprovanteVinculo}
            onNeedsComprovanteVinculoChange={(v) => setState((prev) => ({ ...prev, needsComprovanteVinculo: v }))}
            cvSignatarioName={state.cvSignatarioName}
            onCvSignatarioNameChange={(v) => setState((prev) => ({ ...prev, cvSignatarioName: v }))}
            cvSignatarioCpf={state.cvSignatarioCpf}
            onCvSignatarioCpfChange={(v) => setState((prev) => ({ ...prev, cvSignatarioCpf: v }))}
          />
        )}

        {currentStep === 3 && (
          <StepEnviarCliente
            orderId={state.orderId}
            clientName={state.step1.clientName}
            clientPhone={state.step1.clientPhone}
            paymentUrl={state.paymentUrl}
          />
        )}

        {currentStep === 4 && (
          <StepEnvio
            orderId={state.orderId}
            orderAmount={state.orderAmount}
            clientName={state.step1.clientName}
            clientDocument={state.step1.clientDocument}
            clientAddress={(clients ?? []).find((c) => c.id === state.step1.clientId)?.address}
            repUserId={state.selectedRepresentanteId || undefined}
            repEmail={(repUsers ?? []).find((r) => r.id === state.selectedRepresentanteId)?.email}
            repInvoice={state.gpOrderId || undefined}
          />
        )}
      </StepWizard>

      {/* Submission overlay */}
      {isSubmitting && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {currentStep === 0 ? 'Criando pedido…' : 'Finalizando…'}
        </div>
      )}
    </div>
  );
}
