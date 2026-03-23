'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { ImageViewer } from '@/components/shared/image-viewer';
import { QuickAddClientDialog, QuickAddDoctorDialog } from './quick-add-dialog';
import { cn } from '@/lib/utils';
import { computeFileHash } from '@/lib/file-hash';
import { useToast } from '@/hooks/use-toast';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { useFirebase } from '@/firebase/provider';
import type { Client, Doctor, Product, Representante, User, PaymentLink } from '@/types';
import type { ProductLine } from './nova-venda-wizard';
import type { PrescriptionExtraction } from '@/app/api/ai/extract-prescription/route';

// ─── helpers ────────────────────────────────────────────────────────────────

function normalize(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function nameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalize(a); const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

/**
 * Fallback fuzzy matcher when the AI didn't return a catalogSku.
 * Scores a catalog product against a raw prescription string by counting
 * how many meaningful tokens (numbers, key words) appear in both.
 * Returns the best-scoring product with score > 0, or null.
 */
function fuzzyMatchProduct(
  rawName: string,
  products: Product[],
): Product | null {
  if (!rawName || products.length === 0) return null;

  const raw = normalize(rawName);

  // Extract numeric tokens (e.g. "7000", "3500", "60", "30", "10")
  const rawNums = new Set(raw.match(/\d+/g) ?? []);
  // Extract meaningful word tokens (length > 2, not purely numeric filler)
  const rawWords = new Set(
    raw.split(/\s+/).filter((t) => t.length > 2 && !/^\d+$/.test(t)),
  );

  let bestScore = 0;
  let bestProduct: Product | null = null;

  for (const p of products) {
    const pn = normalize(p.name);
    const pc = normalize(p.concentration ?? '');
    const combined = `${pn} ${pc}`;

    let score = 0;

    // Each matching number is a strong signal
    for (const n of rawNums) {
      if (combined.includes(n)) score += 3;
    }
    // Each matching word token
    for (const w of rawWords) {
      if (combined.includes(w)) score += 1;
    }
    // Substring containment bonus
    if (pn.includes(raw) || raw.includes(pn)) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestProduct = p;
    }
  }

  return bestScore > 0 ? bestProduct : null;
}

// ─── types ───────────────────────────────────────────────────────────────────

export interface Step1State {
  clientId: string;
  clientName: string;
  clientDocument: string;
  clientPhone: string;
  clientIsNew: boolean;
  doctorId: string;
  doctorName: string;
  doctorCrm: string;
  doctorIsNew: boolean;
  prescriptionFile: File | null;
  prescriptionFileName: string;
  /** SHA-256 hex hash of the prescription file (for duplicate detection). */
  prescriptionHash: string;
  /** Date printed on the prescription (YYYY-MM-DD), extracted by AI or null if not found. */
  prescriptionDate: string;
  products: ProductLine[];
  anvisaOption: string;
  allowedPaymentMethods: {
    creditCard: boolean;
    debitCard: boolean;
    boleto: boolean;
    pix: boolean;
  };
}

interface StepIdentificacaoProps {
  state: Step1State;
  onChange: (changes: Partial<Step1State>) => void;
  clients: Client[];
  doctors: Doctor[];
  allProducts: Product[];
  /** PTAX midpoint rate (BRL per 1 USD) */
  exchangeRate: number;
  exchangeRateLoading: boolean;
  exchangeRateError: string | null;
  exchangeRateDate: string;
  /** List of active rep users (isRepresentante === true) */
  repUsers: User[];
  /** Currently selected rep user ID */
  selectedRepresentanteId: string;
  /** Called when the user picks a rep */
  onRepresentanteChange: (id: string, name: string) => void;
  /** Frete (shipping cost, BRL) — entered here so it's included in the GlobalPay link */
  frete: number;
  onFreteChange: (value: number) => void;
  /** Admin-only: unassigned standalone payments available to link */
  isAdmin: boolean;
  unassignedPayments: PaymentLink[];
  selectedUnassignedPaymentId: string;
  onUnassignedPaymentSelect: (id: string, payment: PaymentLink | null) => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export function StepIdentificacao({
  state, onChange, clients, doctors, allProducts,
  exchangeRate, exchangeRateLoading, exchangeRateError, exchangeRateDate,
  repUsers, selectedRepresentanteId, onRepresentanteChange,
  frete, onFreteChange,
  isAdmin, unassignedPayments, selectedUnassignedPaymentId, onUnassignedPaymentSelect,
}: StepIdentificacaoProps) {
  const { user } = useFirebase();
  const { toast } = useToast();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionMsg, setExtractionMsg] = useState<string | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddDoctor, setShowAddDoctor] = useState(false);

  // Prescription age warning toast — fires once when prescriptionDate is set and age >= 5 months
  const lastRxToastDate = React.useRef<string | null>(null);
  useEffect(() => {
    if (!state.prescriptionDate || state.prescriptionDate === lastRxToastDate.current) return;
    const rxDate = new Date(state.prescriptionDate + 'T12:00:00');
    if (isNaN(rxDate.getTime())) return;
    const now = new Date();
    const ageMonths = (now.getFullYear() - rxDate.getFullYear()) * 12 + (now.getMonth() - rxDate.getMonth());
    if (ageMonths < 5) return;
    lastRxToastDate.current = state.prescriptionDate;
    const expiry = new Date(rxDate);
    expiry.setMonth(expiry.getMonth() + 6);
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const expiryStr = expiry.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (daysLeft <= 0) {
      toast({ variant: 'destructive', title: 'Receita vencida!', description: `Receita com ${ageMonths} meses. Venceu em ${expiryStr}.` });
    } else {
      toast({ variant: 'destructive', title: 'Receita proxima do vencimento!', description: `Receita com ${ageMonths} meses. Vence em ${expiryStr} (${daysLeft} dia${daysLeft !== 1 ? 's' : ''}).` });
    }
  }, [state.prescriptionDate, toast]);

  // Track when an external file is being dragged over the window
  const [isDraggingOnPage, setIsDraggingOnPage] = useState(false);
  const dragCounter = React.useRef(0);
  // Track when the file is hovering directly over the prohibited Produtos zone
  const [isDraggingOverProhibited, setIsDraggingOverProhibited] = useState(false);
  const prohibitedDragCounter = React.useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      // Only react to external file drags
      if (e.dataTransfer?.types?.includes('Files')) {
        dragCounter.current++;
        if (dragCounter.current === 1) setIsDraggingOnPage(true);
      }
    };
    const handleDragLeave = () => {
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) {
        setIsDraggingOnPage(false);
        setIsDraggingOverProhibited(false);
        prohibitedDragCounter.current = 0;
      }
    };
    const handleDrop = () => {
      dragCounter.current = 0;
      setIsDraggingOnPage(false);
      setIsDraggingOverProhibited(false);
      prohibitedDragCounter.current = 0;
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Local editing state for the frete (shipping cost) input field
  const [freteInput, setFreteInput] = useState(frete > 0 ? String(frete) : '');

  // Local editing state for "P. Total" inputs — holds the raw string while
  // the user is typing so that the computed value doesn't overwrite mid-edit.
  const [editingTotals, setEditingTotals] = useState<Record<string, string>>({});

  // Local editing state for the all-product order total — same pattern as editingTotals.
  const [editingOrderTotal, setEditingOrderTotal] = useState<string | null>(null);

  // Generate a blob URL for image preview (revoked on file change / unmount)
  const previewUrl = useMemo(() => {
    if (!state.prescriptionFile || !state.prescriptionFile.type?.startsWith('image/')) return null;
    return URL.createObjectURL(state.prescriptionFile);
  }, [state.prescriptionFile]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const clientOptions = clients.map((c) => ({
    value: c.id, label: c.fullName, sublabel: c.document ? `CPF: ${c.document}` : undefined,
  }));
  const doctorOptions = doctors.map((d) => ({
    value: d.id, label: d.fullName, sublabel: `CRM: ${d.crm}`,
  }));
  const productOptions = allProducts.map((p) => ({
    value: p.id, label: p.name, sublabel: p.concentration ? p.concentration : p.sku,
  }));

  // ── product line helpers ──────────────────────────────────────────────────
  const addProductLine = () => {
    onChange({
      products: [...state.products, {
        id: crypto.randomUUID(), productId: '', productName: '',
        quantity: 1, listPrice: 0, negotiatedPrice: 0, discount: 0,
      }],
    });
  };

  const updateLine = (id: string, changes: Partial<ProductLine>) => {
    onChange({ products: state.products.map((l) => (l.id === id ? { ...l, ...changes } : l)) });
  };

  const removeLine = (id: string) => {
    onChange({ products: state.products.filter((l) => l.id !== id) });
  };

  const handleProductSelect = (lineId: string, productId: string) => {
    const product = allProducts.find((p) => p.id === productId);
    if (product) {
      const brlPrice = parseFloat((product.price * exchangeRate).toFixed(2));
      updateLine(lineId, {
        productId, productName: product.name,
        listPrice: product.price,          // USD from catalog
        negotiatedPrice: brlPrice,         // BRL default
        discount: 0, aiHintName: undefined,
      });
    } else {
      updateLine(lineId, { productId, productName: '' });
    }
  };

  const handleNegotiatedPriceChange = (lineId: string, negotiatedPriceBRL: number) => {
    const line = state.products.find((l) => l.id === lineId);
    if (!line) return;
    const listPriceBRL = line.listPrice * exchangeRate;
    const discount = listPriceBRL > 0
      ? Math.max(0, Math.min(100, ((listPriceBRL - negotiatedPriceBRL) / listPriceBRL) * 100))
      : 0;
    updateLine(lineId, { negotiatedPrice: negotiatedPriceBRL, discount });
  };

  /**
   * When the user edits the negotiated TOTAL (BRL) for a line, back-calculate
   * the unit price by dividing by qty and rounding DOWN to the nearest cent.
   * Then recompute the discount from that unit price vs the BRL list price.
   */
  const handleNegotiatedTotalChange = (lineId: string, total: number) => {
    const line = state.products.find((l) => l.id === lineId);
    if (!line) return;
    const qty = Math.max(1, line.quantity);
    // Floor to nearest cent: never let fractional cents inflate the unit price
    const unitPriceBRL = Math.floor((Math.max(0, total) / qty) * 100) / 100;
    const listPriceBRL = line.listPrice * exchangeRate;
    const discount = listPriceBRL > 0
      ? Math.max(0, Math.min(100, ((listPriceBRL - unitPriceBRL) / listPriceBRL) * 100))
      : 0;
    updateLine(lineId, { negotiatedPrice: unitPriceBRL, discount });
  };

  const handleDiscountChange = (lineId: string, discount: number) => {
    const line = state.products.find((l) => l.id === lineId);
    if (!line) return;
    const clampedDiscount = Math.max(0, Math.min(100, discount));
    const listPriceBRL = line.listPrice * exchangeRate;
    const negotiatedPrice = parseFloat((listPriceBRL * (1 - clampedDiscount / 100)).toFixed(2));
    updateLine(lineId, { discount: clampedDiscount, negotiatedPrice });
  };

  /**
   * When the user edits the ALL-PRODUCT order total, compute a single target
   * discount percentage and apply it uniformly to every product line.
   * This ensures all lines share the same Desc %.
   */
  const handleOrderTotalChange = (newTotal: number) => {
    const activeLines = state.products.filter((p) => p.productId);
    if (activeLines.length === 0) return;

    // Total list price in BRL across all active lines
    const totalListBRL = activeLines.reduce(
      (s, p) => s + p.listPrice * exchangeRate * p.quantity, 0,
    );

    // Uniform discount %: clamp between 0–100
    const targetDiscount = totalListBRL > 0
      ? Math.max(0, Math.min(100, ((totalListBRL - Math.max(0, newTotal)) / totalListBRL) * 100))
      : 0;

    const updated = state.products.map((line) => {
      if (!line.productId) return line;

      const listPriceBRL = line.listPrice * exchangeRate;
      const unitPriceBRL = parseFloat((listPriceBRL * (1 - targetDiscount / 100)).toFixed(2));

      return { ...line, negotiatedPrice: unitPriceBRL, discount: targetDiscount };
    });

    onChange({ products: updated });
  };

  // ── AI extraction ─────────────────────────────────────────────────────────
  const runExtraction = useCallback(async (file: File) => {
    setIsExtracting(true); setExtractionMsg(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const idToken = await user?.getIdToken();
      if (!idToken) { setExtractionMsg('Sessão expirada. Recarregue a página.'); return; }
      const res = await fetchWithTimeout('/api/ai/extract-prescription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' }),
        timeout: 60_000,
      });
      if (!res.ok) { setExtractionMsg('Falha na autenticação. Recarregue a página.'); return; }
      const data: PrescriptionExtraction = await res.json();
      if (data._error) { setExtractionMsg(data._error); return; }

      const updates: Partial<Step1State> = {};

      // Capture prescription date if the AI found one
      if (data.prescriptionDate) {
        updates.prescriptionDate = data.prescriptionDate;
      }

      if (data.patientName) {
        const matched = clients.find((c) => nameMatches(c.fullName, data.patientName!));
        if (matched) {
          updates.clientId = matched.id; updates.clientName = matched.fullName;
          updates.clientDocument = matched.document; updates.clientPhone = matched.phone ?? '';
          updates.clientIsNew = false;
        } else {
          updates.clientId = ''; updates.clientName = data.patientName;
          updates.clientDocument = data.patientDocument ?? ''; updates.clientPhone = '';
          updates.clientIsNew = true;
        }
      }

      if (data.doctorName || data.doctorCrm) {
        const matched = doctors.find((d) =>
          (data.doctorName && nameMatches(d.fullName, data.doctorName)) ||
          (data.doctorCrm && d.crm && normalize(d.crm).includes(normalize(data.doctorCrm)))
        );
        if (matched) {
          updates.doctorId = matched.id; updates.doctorName = matched.fullName;
          updates.doctorCrm = matched.crm; updates.doctorIsNew = false;
          // Auto-select the doctor's assigned rep
          if (matched.repUserId && !selectedRepresentanteId) {
            const rep = repUsers.find((r) => r.id === matched.repUserId);
            if (rep) onRepresentanteChange(rep.id, rep.displayName || rep.email);
          }
        } else {
          updates.doctorId = ''; updates.doctorName = data.doctorName ?? '';
          updates.doctorCrm = data.doctorCrm ?? ''; updates.doctorIsNew = true;
        }
      }

      if (data.products?.length) {
        updates.products = data.products.map((ap) => {
          // 1. AI returned a catalogSku → exact SKU lookup (most reliable)
          // 2. Fuzzy token match (numbers + keywords in name/concentration)
          // 3. Simple substring name match as last resort
          const matched =
            (ap.catalogSku ? allProducts.find((p) => p.sku === ap.catalogSku) : null) ??
            fuzzyMatchProduct(ap.name, allProducts) ??
            allProducts.find((p) => nameMatches(p.name, ap.name)) ??
            null;

          if (matched) {
            const brlPrice = parseFloat((matched.price * exchangeRate).toFixed(2));
            return {
              id: crypto.randomUUID(), productId: matched.id, productName: matched.name,
              quantity: ap.quantity ?? 1, listPrice: matched.price,
              negotiatedPrice: brlPrice, discount: 0,
            };
          }
          return {
            id: crypto.randomUUID(), productId: '', productName: '',
            quantity: ap.quantity ?? 1, listPrice: 0, negotiatedPrice: 0, discount: 0,
            aiHintName: ap.name,
          };
        });
      }

      onChange(updates);
      const newItems = [updates.clientIsNew, updates.doctorIsNew].filter(Boolean).length
        + (updates.products ?? []).filter((l) => !l.productId && l.aiHintName).length;
      setExtractionMsg(newItems > 0
        ? `${newItems} item(s) não encontrado(s) no cadastro — destacados em amarelo.`
        : 'Campos preenchidos automaticamente com sucesso!');
    } catch {
      setExtractionMsg('Falha ao processar receita. Preencha os campos manualmente.');
    } finally {
      setIsExtracting(false);
    }
  }, [user, clients, doctors, allProducts, onChange, exchangeRate]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles[0]) return;
    const file = acceptedFiles[0];
    onChange({ prescriptionFile: file, prescriptionFileName: file.name, prescriptionHash: '' });
    runExtraction(file);
    // Compute SHA-256 hash in parallel (for duplicate prescription detection)
    computeFileHash(file).then((hash) => onChange({ prescriptionHash: hash }));
  }, [onChange, runExtraction]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1, disabled: isExtracting,
  });

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const fmtUSD = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

  const orderTotal = state.products.reduce(
    (sum, p) => sum + p.negotiatedPrice * p.quantity, 0
  );


  return (
    <div>
      {/* Quick-add dialogs */}
      <QuickAddClientDialog
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        prefillName={state.clientIsNew ? state.clientName : undefined}
        prefillDocument={state.clientIsNew ? state.clientDocument : undefined}
        onCreated={(clientId, clientName, clientDocument, clientPhone) => {
          onChange({ clientId, clientName, clientDocument, clientPhone, clientIsNew: false });
          setShowAddClient(false);
        }}
      />
      <QuickAddDoctorDialog
        open={showAddDoctor}
        onClose={() => setShowAddDoctor(false)}
        prefillName={state.doctorIsNew ? state.doctorName : undefined}
        prefillCrm={state.doctorIsNew ? state.doctorCrm : undefined}
        onCreated={(doctorId, doctorName, doctorCrm) => {
          onChange({ doctorId, doctorName, doctorCrm, doctorIsNew: false });
          setShowAddDoctor(false);
        }}
      />

      <div>
      {/* ── Main column ─── */}
      <div className="space-y-7">

      {/* ── Client & Doctor — side by side ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Client */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Paciente / Cliente <span className="text-red-500">*</span></Label>
          {state.clientIsNew && state.clientName && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="truncate">Não encontrado: <strong>{state.clientName}</strong></p>
                <Button type="button" size="sm" variant="outline" className="mt-1.5 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
                  onClick={() => setShowAddClient(true)}>
                  + Cadastrar novo
                </Button>
              </div>
            </div>
          )}
          <SearchableSelect
            options={clientOptions}
            value={state.clientId}
            onChange={(id) => {
              const client = clients.find((c) => c.id === id);
              if (client) onChange({ clientId: id, clientName: client.fullName, clientDocument: client.document, clientPhone: client.phone ?? '', clientIsNew: false });
            }}
            placeholder="Buscar paciente…"
            searchPlaceholder="Nome ou CPF…"
            emptyMessage="Nenhum paciente encontrado."
          />
        </div>

        {/* Doctor */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Médico Prescritor <span className="text-red-500">*</span></Label>
          {state.doctorIsNew && (state.doctorName || state.doctorCrm) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="truncate">Não encontrado: <strong>{state.doctorName || '–'}{state.doctorCrm ? ` (${state.doctorCrm})` : ''}</strong></p>
                <Button type="button" size="sm" variant="outline" className="mt-1.5 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
                  onClick={() => setShowAddDoctor(true)}>
                  + Cadastrar novo
                </Button>
              </div>
            </div>
          )}
          <SearchableSelect
            options={doctorOptions}
            value={state.doctorId}
            onChange={(id) => {
              const doctor = doctors.find((d) => d.id === id);
              if (doctor) {
                onChange({ doctorId: id, doctorName: doctor.fullName, doctorCrm: doctor.crm, doctorIsNew: false });
                // Auto-select the doctor's assigned rep (if any and no rep currently selected)
                if (doctor.repUserId && !selectedRepresentanteId) {
                  const rep = repUsers.find((r) => r.id === doctor.repUserId);
                  if (rep) onRepresentanteChange(rep.id, rep.displayName || rep.email);
                }
              }
            }}
            placeholder="Buscar médico…"
            searchPlaceholder="Nome ou CRM…"
            emptyMessage="Nenhum médico encontrado."
          />
        </div>
      </div>

      {/* ── Prescription upload & viewer ──────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Receita Médica</Label>
          {state.prescriptionFile && !isExtracting && (
            <div {...getRootProps()} className="contents">
              <input {...getInputProps()} />
              <Button type="button" variant="outline" size="sm" className="text-xs gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Trocar receita
              </Button>
            </div>
          )}
        </div>

        {isExtracting ? (
          /* ── Extraction spinner ─── */
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-8 text-center pointer-events-none">
            <div className="mb-3 h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-primary">Analisando com IA…</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Extraindo dados da receita</p>
          </div>
        ) : previewUrl && state.prescriptionFile?.type?.startsWith('image/') ? (
          /* ── Image viewer with zoom / pan / rotate ─── */
          <ImageViewer
            src={previewUrl}
            alt={state.prescriptionFileName || 'Receita médica'}
          />
        ) : state.prescriptionFile ? (
          /* ── PDF or non-image file fallback ─── */
          <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/30 px-6 py-8 text-center">
            <svg className="mb-2 h-10 w-10 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-green-700 truncate max-w-xs">{state.prescriptionFileName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Arquivo enviado com sucesso</p>
          </div>
        ) : (
          /* ── Initial drop zone ─── */
          <div
            {...getRootProps()}
            className={cn(
              'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all cursor-pointer select-none',
              isDragActive
                ? 'border-green-500 bg-green-50 scale-[1.01] ring-2 ring-green-400'
                : isDraggingOnPage
                  ? 'border-green-400 bg-green-50/60 ring-2 ring-green-300 animate-pulse'
                  : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40',
            )}
          >
            <input {...getInputProps()} />
            <svg className={cn('mb-3 h-10 w-10', isDraggingOnPage ? 'text-green-600' : 'text-muted-foreground')} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className={cn('text-sm font-semibold', isDraggingOnPage && 'text-green-700')}>
              {isDraggingOnPage ? 'Solte a receita aqui!' : 'Arraste a receita aqui'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">A IA preencherá os campos automaticamente · PDF, JPG, PNG (máx 5MB)</p>
          </div>
        )}

        {extractionMsg && (
          <p className={cn('flex items-center gap-1.5 text-xs', extractionMsg.includes('sucesso') ? 'text-green-600' : 'text-amber-600')}>
            {extractionMsg.includes('sucesso') ? '✓' : '⚠'} {extractionMsg}
          </p>
        )}

        {/* Prescription expiration notice (6-month validity) */}
        {state.prescriptionDate && (() => {
          const rxDate = new Date(state.prescriptionDate + 'T12:00:00');
          const expiry = new Date(rxDate);
          expiry.setMonth(expiry.getMonth() + 6);
          const now = new Date();
          const msLeft = expiry.getTime() - now.getTime();
          const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
          const isExpired = daysLeft <= 0;
          const isNearExpiry = daysLeft > 0 && daysLeft <= 30;
          const expiryStr = expiry.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const rxDateStr = rxDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

          if (isExpired) {
            return (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="font-semibold">Receita vencida!</p>
                  <p className="text-xs">Data da receita: {rxDateStr} · Venceu em {expiryStr}</p>
                </div>
              </div>
            );
          }
          if (isNearExpiry) {
            return (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="font-semibold">Receita próxima do vencimento!</p>
                  <p className="text-xs">Data da receita: {rxDateStr} · Vence em {expiryStr} ({daysLeft} dia{daysLeft !== 1 ? 's' : ''})</p>
                </div>
              </div>
            );
          }
          return (
            <p className="text-xs text-muted-foreground">
              Receita de {rxDateStr} · Válida até {expiryStr}
            </p>
          );
        })()}
      </div>

      {/* ── Products ──────────────────────────────────────────────── */}
      <div
        className="relative space-y-3"
        onDragEnter={(e) => {
          if (isDraggingOnPage && !state.prescriptionFile && e.dataTransfer?.types?.includes('Files')) {
            prohibitedDragCounter.current++;
            if (prohibitedDragCounter.current === 1) setIsDraggingOverProhibited(true);
          }
        }}
        onDragLeave={() => {
          prohibitedDragCounter.current = Math.max(0, prohibitedDragCounter.current - 1);
          if (prohibitedDragCounter.current === 0) setIsDraggingOverProhibited(false);
        }}
        onDragOver={(e) => { if (isDraggingOnPage) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          prohibitedDragCounter.current = 0;
          setIsDraggingOverProhibited(false);
        }}
      >
        {/* Red overlay when dragging a file — two-step warning */}
        {isDraggingOnPage && !state.prescriptionFile && (
          <div className={cn(
            'absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl border-dashed pointer-events-none overflow-hidden transition-all',
            isDraggingOverProhibited
              ? 'border-4 border-red-500 bg-red-100/95'
              : 'border-2 border-red-400 bg-red-50/90',
          )}>
            {isDraggingOverProhibited ? (
              <>
                {/* Escalated: big NÃO! texts in a single row */}
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <span className="text-5xl font-black text-red-500/80 tracking-widest select-none">NÃO!</span>
                  <span className="text-5xl font-black text-red-600/90 tracking-widest select-none">NÃO!</span>
                  <span className="text-5xl font-black text-red-500/80 tracking-widest select-none">NÃO!</span>
                  <span className="text-5xl font-black text-red-600/90 tracking-widest select-none">NÃO!</span>
                </div>
                <p className="mt-2 text-sm font-bold text-red-700">↑ Arraste para a área de Receita acima ↑</p>
              </>
            ) : (
              <>
                {/* Initial: small prohibition icon + message */}
                <svg className="mx-auto mb-2 h-10 w-10 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <p className="text-lg font-bold text-red-600">Não solte aqui</p>
                <p className="text-sm text-red-500">Arraste para a área de Receita acima</p>
              </>
            )}
          </div>
        )}

        <Label className="text-sm font-semibold">Produtos <span className="text-red-500">*</span></Label>

        {/* Exchange rate banner */}
        {exchangeRateLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent flex-shrink-0" />
            Carregando cotação PTAX…
          </div>
        )}
        {exchangeRateError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {exchangeRateError}
          </div>
        )}
        {exchangeRate > 0 && !exchangeRateLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <span>Cotação PTAX: <strong>1 USD = {exchangeRate.toFixed(4)} BRL</strong></span>
            <span className="text-blue-500">({exchangeRateDate})</span>
          </div>
        )}

        {state.products.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">Envie uma receita acima para preencher os produtos automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="hidden grid-cols-[1fr_60px_60px_90px_90px_90px_70px_36px] gap-2 px-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Produto</span>
              <span className="text-center">Qtd</span>
              <span className="text-center">Qtd Rx</span>
              <span className="text-center">Preço Lista</span>
              <span className="text-center">P. Unit.</span>
              <span className="text-center">P. Total</span>
              <span className="text-center">Desc %</span>
              <span />
            </div>

            {state.products.map((line) => (
              <div
                key={line.id}
                className={cn(
                  'grid grid-cols-[1fr_60px_60px_90px_90px_90px_70px_36px] items-center gap-2 rounded-lg border p-2',
                  line.aiHintName && !line.productId ? 'border-amber-300 bg-amber-50' : 'border-border bg-card',
                )}
              >
                <div className="min-w-0 space-y-1">
                  {line.aiHintName && !line.productId && (
                    <p className="truncate text-xs font-medium text-amber-600">IA: {line.aiHintName}</p>
                  )}
                  <SearchableSelect
                    options={productOptions}
                    value={line.productId}
                    onChange={(id) => handleProductSelect(line.id, id)}
                    placeholder="Selecionar produto…"
                    searchPlaceholder="Buscar produto…"
                  />
                </div>
                {/* Qty */}
                <Input type="number" min={1} value={line.quantity}
                  onChange={(e) => updateLine(line.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  onBlur={() => {
                    if (line.prescribedQty && line.quantity > line.prescribedQty) {
                      toast({ variant: 'destructive', title: 'Quantidade excede a receita', description: `Produto "${line.productName || 'selecionado'}": quantidade ${line.quantity} excede a prescrita (${line.prescribedQty}).` });
                    }
                  }}
                  className={cn('text-center px-1', line.prescribedQty && line.quantity > line.prescribedQty && 'border-amber-400 ring-1 ring-amber-400')} />
                {/* Prescribed Qty */}
                <Input type="number" min={0} value={line.prescribedQty ?? ''}
                  onChange={(e) => updateLine(line.id, { prescribedQty: e.target.value ? Math.max(0, parseInt(e.target.value) || 0) : undefined })}
                  placeholder="—"
                  className="text-center px-1" />
                {/* List price in BRL (read-only — converted from USD catalog price) */}
                <div className="flex flex-col items-center justify-center rounded-md border bg-muted/40 px-1 py-1 text-center text-muted-foreground h-9" title={line.listPrice > 0 ? `${fmtUSD(line.listPrice)}` : undefined}>
                  {line.listPrice > 0 ? (
                    <span className="text-xs leading-tight">{fmtBRL(line.listPrice * exchangeRate)}</span>
                  ) : '—'}
                </div>
                {/* Negotiated UNIT price — changing this recalculates total & discount */}
                <Input type="number" min={0} step="0.01"
                  value={line.negotiatedPrice}
                  onChange={(e) => handleNegotiatedPriceChange(line.id, parseFloat(e.target.value) || 0)}
                  className="text-center px-1" />
                {/* Negotiated TOTAL price — user types freely; committed on blur */}
                <Input type="number" min={0} step="0.01"
                  value={
                    editingTotals[line.id] !== undefined
                      ? editingTotals[line.id]
                      : parseFloat((line.negotiatedPrice * line.quantity).toFixed(2))
                  }
                  onFocus={() =>
                    setEditingTotals((prev) => ({
                      ...prev,
                      [line.id]: (line.negotiatedPrice * line.quantity).toFixed(2),
                    }))
                  }
                  onChange={(e) =>
                    setEditingTotals((prev) => ({ ...prev, [line.id]: e.target.value }))
                  }
                  onBlur={() => {
                    const raw = editingTotals[line.id];
                    if (raw !== undefined) {
                      handleNegotiatedTotalChange(line.id, parseFloat(raw) || 0);
                    }
                    setEditingTotals((prev) => {
                      const next = { ...prev };
                      delete next[line.id];
                      return next;
                    });
                  }}
                  className="text-center px-1" />
                {/* Discount % — editable, back-calculates negotiated price */}
                <Input type="number" min={0} max={100} step="0.1"
                  value={line.listPrice > 0 ? parseFloat(line.discount.toFixed(1)) : ''}
                  onChange={(e) => handleDiscountChange(line.id, parseFloat(e.target.value) || 0)}
                  disabled={line.listPrice <= 0}
                  className="text-center px-1"
                  placeholder="—" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLine(line.id)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            ))}

            {/* Total — editable, distributes changes equally across product lines */}
            <div className="flex items-center justify-end gap-2 border-t pt-3 pr-2">
              <label className="text-sm font-medium">Total:</label>
              <div className="relative w-36">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span>
                <Input
                  type="number" min={0} step="0.01"
                  value={
                    editingOrderTotal !== null
                      ? editingOrderTotal
                      : parseFloat(orderTotal.toFixed(2))
                  }
                  onFocus={() => setEditingOrderTotal(orderTotal.toFixed(2))}
                  onChange={(e) => setEditingOrderTotal(e.target.value)}
                  onBlur={() => {
                    if (editingOrderTotal !== null) {
                      handleOrderTotalChange(parseFloat(editingOrderTotal) || 0);
                    }
                    setEditingOrderTotal(null);
                  }}
                  className="pl-8 text-right font-bold text-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Representante ──────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Representante</Label>
          <p className="text-xs text-muted-foreground">Opcional. Associe esta venda a um representante.</p>
        </div>
        <Select
          value={selectedRepresentanteId || '__none__'}
          onValueChange={(val) => {
            if (val === '__none__') {
              onRepresentanteChange('', 'Venda Direta');
              return;
            }
            const rep = repUsers.find((r) => r.id === val);
            if (rep) {
              onRepresentanteChange(rep.id, rep.displayName || rep.email);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Nenhum (Venda Direta)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nenhum (Venda Direta)</SelectItem>
            {repUsers.map((rep) => (
              <SelectItem key={rep.id} value={rep.id}>
                {rep.displayName || rep.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Payment methods ────────────────────────────────────── */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Meios de Pagamento</Label>
        <p className="text-xs text-muted-foreground">Desmarque as opções que não estão disponíveis para esta venda.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            { key: 'creditCard' as const, label: 'Cartão de Crédito' },
            { key: 'debitCard' as const, label: 'Cartão de Débito' },
            { key: 'boleto' as const, label: 'Boleto' },
            { key: 'pix' as const, label: 'Pix' },
          ]).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
              <Checkbox
                checked={state.allowedPaymentMethods[key]}
                onCheckedChange={(checked) =>
                  onChange({
                    allowedPaymentMethods: {
                      ...state.allowedPaymentMethods,
                      [key]: !!checked,
                    },
                  })
                }
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Frete ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="frete-input" className="text-sm font-semibold">Frete (R$)</Label>
        <p className="text-xs text-muted-foreground">
          Custo de envio incluído no valor do link de pagamento GlobalPay.
        </p>
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
          className="max-w-[200px]"
        />
      </div>

      {/* ── Vincular Pagamento Avulso (admin only) ─────────────── */}
      {isAdmin && unassignedPayments.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <Label className="text-sm font-semibold">Vincular Pagamento Avulso</Label>
          <p className="text-xs text-muted-foreground">
            Vincule um pagamento já criado a esta venda. O sistema não gerará um novo link GlobalPay.
          </p>
          <Select
            value={selectedUnassignedPaymentId || '__none__'}
            onValueChange={(v) => {
              if (v === '__none__') {
                onUnassignedPaymentSelect('', null);
              } else {
                const payment = unassignedPayments.find((p) => p.id === v) ?? null;
                onUnassignedPaymentSelect(v, payment);
              }
            }}
          >
            <SelectTrigger className="max-w-[400px]">
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nenhum</SelectItem>
              {unassignedPayments.map((pl) => (
                <SelectItem key={pl.id} value={pl.id}>
                  {pl.invoice || pl.id.slice(0, 8)} — {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: pl.currency || 'BRL' }).format(pl.amount)}
                  {pl.clientName ? ` — ${pl.clientName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      </div>

      </div>

    </div>
  );
}
