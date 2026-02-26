'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getActiveClientsQuery } from '@/services/clients.service';
import { getActiveDoctorsQuery } from '@/services/doctors.service';
import { getActiveProductsQuery } from '@/services/products.service';
import { createOrder } from '@/services/orders.service';
import { createOrderDocumentRequest, updateDocumentRequestStatus } from '@/services/documents.service';
import { updateOrderStatus } from '@/services/orders.service';
import { StepWizard } from '@/components/shared/step-wizard';
import { StepIdentificacao, type Step1State } from './step-identificacao';
import { StepPagamento } from './step-pagamento';
import { StepDocumentacao } from './step-documentacao';
import { PostWizardDialog } from './post-wizard-dialog';
import type { Client, Doctor, Product } from '@/types';

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
  products: [],
  anvisaOption: 'regular',
};

const INITIAL_STATE: WizardState = {
  step1: INITIAL_STEP1,
  orderId: '',
  orderAmount: 0,
  paymentUrl: '',
  gpOrderId: '',
};

const STEPS = [
  { label: 'Identificação', description: 'Paciente, médico e produtos' },
  { label: 'Pagamento', description: 'Gerar link GlobalPay' },
  { label: 'Documentação', description: 'Checklist de documentos' },
];

// ─── component ───────────────────────────────────────────────────────────────

interface NovaVendaWizardProps {
  onComplete: (orderId: string) => void;
}

export function NovaVendaWizard({ onComplete }: NovaVendaWizardProps) {
  const router = useRouter();
  const { firestore, storage, user } = useFirebase();

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

  const { data: clients } = useCollection<Client>(clientsQ);
  const { data: doctors } = useCollection<Doctor>(doctorsQ);
  const { data: products } = useCollection<Product>(productsQ);

  // ── wizard state ────────────────────────────────────────────────────────
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Post-completion dialog: shown when one or both entities were quick-added
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState('');

  const updateStep1 = useCallback((changes: Partial<Step1State>) => {
    setState((prev) => ({ ...prev, step1: { ...prev.step1, ...changes } }));
  }, []);

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

      try {
        const { step1 } = state;

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

        // Create order
        const orderId = await createOrder(
          firestore,
          {
            customer: {
              name: step1.clientName,
              document: step1.clientDocument,
              userId: step1.clientId,
            },
            representative: {
              name: 'Venda Direta',
              code: 'DIRECT',
              userId: '',
            },
            doctor: {
              name: step1.doctorName,
              crm: step1.doctorCrm,
              userId: step1.doctorId,
            },
            products: step1.products.map((p) => ({
              stockProductId: p.productId,
              quantity: p.quantity,
              price: p.listPrice,
              discount: p.discount,
              productName: p.productName,
            })),
            anvisaOption: step1.anvisaOption as 'regular' | 'exceptional' | 'exempt',
            prescriptionDocId: prescriptionPath,
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
          await Promise.all(
            docTypes.map((t) => createOrderDocumentRequest(firestore, orderId, t)),
          );
        } catch (docErr) {
          console.warn('Document requests creation failed (continuing):', docErr);
        }

        setState((prev) => ({ ...prev, orderId, orderAmount: amount }));
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
    if (currentStep === 0) return step1Valid;
    if (currentStep === 1) return state.paymentUrl !== '';
    return true; // step 2 — always allow finalize
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
          {submitError}
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
          />
        )}

        {currentStep === 1 && (
          <StepPagamento
            orderId={state.orderId}
            orderAmount={state.orderAmount}
            clientName={state.step1.clientName}
            clientPhone={state.step1.clientPhone}
            clientDocument={state.step1.clientDocument}
            clientEmail=""
            paymentUrl={state.paymentUrl}
            gpOrderId={state.gpOrderId}
            onPaymentGenerated={(paymentUrl, gpOrderId) =>
              setState((prev) => ({ ...prev, paymentUrl, gpOrderId }))
            }
          />
        )}

        {currentStep === 2 && (
          <StepDocumentacao
            orderId={state.orderId}
            anvisaOption={state.step1.anvisaOption}
            clientId={state.step1.clientId}
            clientName={state.step1.clientName}
            doctorId={state.step1.doctorId}
            clientIsNew={state.step1.clientIsNew}
            doctorIsNew={state.step1.doctorIsNew}
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
