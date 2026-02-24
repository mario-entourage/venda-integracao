'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { cn } from '@/lib/utils';
import type { Client, Doctor, Product } from '@/types';
import type { ProductLine } from './nova-venda-wizard';
import type { PrescriptionExtraction } from '@/app/api/ai/extract-prescription/route';

// ─── helpers ────────────────────────────────────────────────────────────────

function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
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
  products: ProductLine[];
  anvisaOption: string;
}

interface StepIdentificacaoProps {
  state: Step1State;
  onChange: (changes: Partial<Step1State>) => void;
  clients: Client[];
  doctors: Doctor[];
  allProducts: Product[];
}

// ─── component ───────────────────────────────────────────────────────────────

export function StepIdentificacao({
  state,
  onChange,
  clients,
  doctors,
  allProducts,
}: StepIdentificacaoProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionMsg, setExtractionMsg] = useState<string | null>(null);

  // ── select options ──────────────────────────────────────────────────────
  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: c.fullName,
    sublabel: c.document ? `CPF: ${c.document}` : undefined,
  }));

  const doctorOptions = doctors.map((d) => ({
    value: d.id,
    label: d.fullName,
    sublabel: `CRM: ${d.crm}`,
  }));

  const productOptions = allProducts.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.concentration ? p.concentration : p.sku,
  }));

  // ── product line helpers ────────────────────────────────────────────────
  const addProductLine = () => {
    onChange({
      products: [
        ...state.products,
        {
          id: crypto.randomUUID(),
          productId: '',
          productName: '',
          quantity: 1,
          price: 0,
          discount: 0,
        },
      ],
    });
  };

  const updateLine = (id: string, changes: Partial<ProductLine>) => {
    onChange({
      products: state.products.map((l) => (l.id === id ? { ...l, ...changes } : l)),
    });
  };

  const removeLine = (id: string) => {
    onChange({ products: state.products.filter((l) => l.id !== id) });
  };

  const handleProductSelect = (lineId: string, productId: string) => {
    const product = allProducts.find((p) => p.id === productId);
    if (product) {
      updateLine(lineId, {
        productId,
        productName: product.name,
        price: product.price,
        aiHintName: undefined,
      });
    } else {
      updateLine(lineId, { productId, productName: '' });
    }
  };

  // ── AI extraction ───────────────────────────────────────────────────────
  const runExtraction = useCallback(
    async (file: File) => {
      setIsExtracting(true);
      setExtractionMsg(null);

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/ai/extract-prescription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' }),
        });
        const data: PrescriptionExtraction = await res.json();

        if (data._error) {
          setExtractionMsg(data._error);
          return;
        }

        const updates: Partial<Step1State> = {};

        // Match client
        if (data.patientName) {
          const matched = clients.find((c) => nameMatches(c.fullName, data.patientName!));
          if (matched) {
            updates.clientId = matched.id;
            updates.clientName = matched.fullName;
            updates.clientDocument = matched.document;
            updates.clientPhone = matched.phone ?? '';
            updates.clientIsNew = false;
          } else {
            updates.clientId = '';
            updates.clientName = data.patientName;
            updates.clientDocument = data.patientDocument ?? '';
            updates.clientPhone = '';
            updates.clientIsNew = true;
          }
        }

        // Match doctor
        if (data.doctorName || data.doctorCrm) {
          const matched = doctors.find(
            (d) =>
              (data.doctorName && nameMatches(d.fullName, data.doctorName)) ||
              (data.doctorCrm &&
                d.crm &&
                normalize(d.crm).includes(normalize(data.doctorCrm))),
          );
          if (matched) {
            updates.doctorId = matched.id;
            updates.doctorName = matched.fullName;
            updates.doctorCrm = matched.crm;
            updates.doctorIsNew = false;
          } else {
            updates.doctorId = '';
            updates.doctorName = data.doctorName ?? '';
            updates.doctorCrm = data.doctorCrm ?? '';
            updates.doctorIsNew = true;
          }
        }

        // Match products
        if (data.products?.length) {
          const lines: ProductLine[] = data.products.map((ap) => {
            const matched = allProducts.find((p) => nameMatches(p.name, ap.name));
            if (matched) {
              return {
                id: crypto.randomUUID(),
                productId: matched.id,
                productName: matched.name,
                quantity: ap.quantity ?? 1,
                price: matched.price,
                discount: 0,
              };
            }
            return {
              id: crypto.randomUUID(),
              productId: '',
              productName: '',
              quantity: ap.quantity ?? 1,
              price: 0,
              discount: 0,
              aiHintName: ap.name,
            };
          });
          updates.products = lines;
        }

        onChange(updates);

        const newCount = [updates.clientIsNew, updates.doctorIsNew].filter(Boolean).length;
        const notFoundProducts = (updates.products ?? []).filter(
          (l) => !l.productId && l.aiHintName,
        ).length;
        if (newCount > 0 || notFoundProducts > 0) {
          setExtractionMsg(
            `${notFoundProducts + newCount} item(s) não encontrados no cadastro — destacados em amarelo.`,
          );
        } else {
          setExtractionMsg('Campos preenchidos automaticamente com sucesso!');
        }
      } catch {
        setExtractionMsg('Falha ao processar receita. Preencha os campos manualmente.');
      } finally {
        setIsExtracting(false);
      }
    },
    [clients, doctors, allProducts, onChange],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      onChange({ prescriptionFile: file, prescriptionFileName: file.name });
      runExtraction(file);
    },
    [onChange, runExtraction],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
    disabled: isExtracting,
  });

  // ── total calculation ───────────────────────────────────────────────────
  const orderTotal = state.products.reduce(
    (sum, p) => sum + p.price * p.quantity * (1 - (p.discount || 0) / 100),
    0,
  );

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-7">
      {/* ── Prescription drop zone ────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Receita Médica</Label>
        <div
          {...getRootProps()}
          className={cn(
            'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all cursor-pointer select-none',
            isDragActive
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40',
            isExtracting && 'pointer-events-none opacity-70',
          )}
        >
          <input {...getInputProps()} />
          {isExtracting ? (
            <>
              <div className="mb-3 h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm font-medium text-primary">Analisando com IA…</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Extraindo dados da receita</p>
            </>
          ) : state.prescriptionFileName ? (
            <>
              <svg
                className="mb-2 h-8 w-8 text-green-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium text-green-700 truncate max-w-xs">
                {state.prescriptionFileName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clique ou arraste para substituir
              </p>
            </>
          ) : (
            <>
              <svg
                className="mb-3 h-10 w-10 text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="text-sm font-semibold">Arraste a receita aqui</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A IA preencherá os campos automaticamente · PDF, JPG, PNG (máx 5MB)
              </p>
            </>
          )}
        </div>
        {extractionMsg && (
          <p
            className={cn(
              'flex items-center gap-1.5 text-xs',
              extractionMsg.includes('sucesso') ? 'text-green-600' : 'text-amber-600',
            )}
          >
            {extractionMsg.includes('sucesso') ? '✓' : '⚠'} {extractionMsg}
          </p>
        )}
      </div>

      {/* ── Client ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          Paciente / Cliente <span className="text-red-500">*</span>
        </Label>
        {state.clientIsNew && state.clientName && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span>
              Extraído da receita: <strong>{state.clientName}</strong> — não encontrado no
              cadastro. Selecione manualmente ou{' '}
              <a
                href="/clientes/novo"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                cadastre aqui
              </a>
              .
            </span>
          </div>
        )}
        <SearchableSelect
          options={clientOptions}
          value={state.clientId}
          onChange={(id) => {
            const client = clients.find((c) => c.id === id);
            if (client) {
              onChange({
                clientId: id,
                clientName: client.fullName,
                clientDocument: client.document,
                clientPhone: client.phone ?? '',
                clientIsNew: false,
              });
            }
          }}
          placeholder="Buscar paciente pelo nome ou CPF…"
          searchPlaceholder="Nome ou CPF…"
          emptyMessage="Nenhum paciente encontrado. Cadastre em Clientes."
        />
      </div>

      {/* ── Doctor ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          Médico Prescritor <span className="text-red-500">*</span>
        </Label>
        {state.doctorIsNew && (state.doctorName || state.doctorCrm) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span>
              Extraído da receita:{' '}
              <strong>
                {state.doctorName || '–'}
                {state.doctorCrm ? ` (CRM: ${state.doctorCrm})` : ''}
              </strong>{' '}
              — não encontrado no cadastro. Selecione manualmente ou{' '}
              <a
                href="/medicos/novo"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                cadastre aqui
              </a>
              .
            </span>
          </div>
        )}
        <SearchableSelect
          options={doctorOptions}
          value={state.doctorId}
          onChange={(id) => {
            const doctor = doctors.find((d) => d.id === id);
            if (doctor) {
              onChange({
                doctorId: id,
                doctorName: doctor.fullName,
                doctorCrm: doctor.crm,
                doctorIsNew: false,
              });
            }
          }}
          placeholder="Buscar médico pelo nome ou CRM…"
          searchPlaceholder="Nome ou CRM…"
          emptyMessage="Nenhum médico encontrado. Cadastre em Médicos."
        />
      </div>

      {/* ── Products ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">
            Produtos <span className="text-red-500">*</span>
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addProductLine}>
            + Adicionar produto
          </Button>
        </div>

        {state.products.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum produto adicionado. Arraste uma receita ou clique em "+ Adicionar produto".
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="hidden grid-cols-[1fr_70px_100px_80px_36px] gap-2 px-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Produto</span>
              <span className="text-center">Qtd</span>
              <span className="text-center">Preço R$</span>
              <span className="text-center">Desc %</span>
              <span />
            </div>

            {state.products.map((line) => (
              <div
                key={line.id}
                className={cn(
                  'grid grid-cols-[1fr_70px_100px_80px_36px] items-center gap-2 rounded-lg border p-2',
                  line.aiHintName && !line.productId
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-border bg-card',
                )}
              >
                <div className="min-w-0 space-y-1">
                  {line.aiHintName && !line.productId && (
                    <p className="truncate text-xs font-medium text-amber-600">
                      IA: {line.aiHintName}
                    </p>
                  )}
                  <SearchableSelect
                    options={productOptions}
                    value={line.productId}
                    onChange={(id) => handleProductSelect(line.id, id)}
                    placeholder="Selecionar produto…"
                    searchPlaceholder="Buscar produto…"
                  />
                </div>
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(line.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  className="text-center px-2"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.price}
                  onChange={(e) =>
                    updateLine(line.id, { price: parseFloat(e.target.value) || 0 })
                  }
                  className="text-center px-2"
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={line.discount}
                  onChange={(e) =>
                    updateLine(line.id, { discount: parseFloat(e.target.value) || 0 })
                  }
                  className="text-center px-2"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLine(line.id)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </div>
            ))}

            {/* Order total */}
            <div className="flex justify-end border-t pt-3 pr-2">
              <p className="text-sm font-medium">
                Total:{' '}
                <span className="text-base font-bold text-primary">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    orderTotal,
                  )}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── ANVISA option ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Opção ANVISA</Label>
        <div className="flex gap-3">
          {(
            [
              { value: 'regular', label: 'Regular' },
              { value: 'exceptional', label: 'Excepcional' },
              { value: 'exempt', label: 'Isento' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ anvisaOption: opt.value })}
              className={cn(
                'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors',
                state.anvisaOption === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-card hover:border-primary/40',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
