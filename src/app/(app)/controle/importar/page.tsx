'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection, doc, writeBatch, serverTimestamp, Timestamp, getDocs, query, where,
} from 'firebase/firestore';
import Papa from 'papaparse';
import { useFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { getActiveProductsQuery } from '@/services/products.service';
import { getPtaxRateForDate } from '@/server/actions/ptax.actions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types/product';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'controle-csv-mapping';

/** All fields the user can map CSV columns to */
const TARGET_FIELDS: { value: string; label: string; group: string }[] = [
  // Identification
  { value: 'representante', label: 'Representante', group: 'Identificação' },
  { value: 'cliente', label: 'Cliente', group: 'Identificação' },
  { value: 'medico', label: 'Médico', group: 'Identificação' },
  { value: 'crmCroRqe', label: 'CRM / CRO / RQE', group: 'Identificação' },
  { value: 'telefone', label: 'Telefone', group: 'Identificação' },
  { value: 'email', label: 'E-mail', group: 'Identificação' },
  // Dates
  { value: 'dataVenda', label: 'Data Venda', group: 'Datas' },
  { value: 'dataOrcamento', label: 'Data Orçamento', group: 'Datas' },
  // Invoices
  { value: 'invoice', label: 'Nº Invoice (Global Pays)', group: 'Invoices' },
  { value: 'invoiceCorrecao', label: 'Nº Invoice (Correção Duplicata)', group: 'Invoices' },
  // Products
  { value: 'qty3500', label: '3500+mg (Qtd)', group: 'Produtos' },
  { value: 'qty5400', label: '5400+mg (Qtd)', group: 'Produtos' },
  { value: 'qty7000', label: '7000+mg (Qtd)', group: 'Produtos' },
  { value: 'qty1750', label: '1750+mg (Qtd)', group: 'Produtos' },
  { value: 'qty2700', label: '2700+mg (Qtd)', group: 'Produtos' },
  { value: 'qty4500', label: '4500+mg (Qtd)', group: 'Produtos' },
  { value: 'qtyThcStrip', label: 'THC Oral Strip - 10mg', group: 'Produtos' },
  // Financial
  { value: 'meioPagamento', label: 'Meio de Pagamento', group: 'Financeiro' },
  { value: 'valorLiquido', label: 'Valor Líquido R$', group: 'Financeiro' },
  { value: 'valorLiquidoMenosFrete', label: 'Valor Líquido (menos Frete) R$', group: 'Financeiro' },
  { value: 'usdbrl', label: 'USDBRL', group: 'Financeiro' },
  { value: 'priceList', label: 'Price List', group: 'Financeiro' },
  // Status
  { value: 'statusOrcamento', label: 'Status do Orçamento', group: 'Status' },
  { value: 'lead', label: 'Lead', group: 'Status' },
  // Shipping
  { value: 'formaEnvio', label: 'Forma de envio', group: 'Envio' },
  { value: 'endereco', label: 'Endereço', group: 'Envio' },
  { value: 'cep', label: 'CEP', group: 'Envio' },
  { value: 'lote', label: 'Lote', group: 'Envio' },
  { value: 'dataEnvio', label: 'Data do Envio', group: 'Envio' },
  { value: 'previsaoEntrega', label: 'Previsão de Entrega', group: 'Envio' },
  { value: 'codigoRastreio', label: 'Código de Rastreio', group: 'Envio' },
  { value: 'statusEnvio', label: 'Status do Envio', group: 'Envio' },
];

const DROPDOWN_VALID_VALUES: Record<string, string[]> = {
  meioPagamento: ['Global Pays', 'Infinity Pays', 'PIX', 'Brazil Pays'],
  statusOrcamento: [
    'Em negociação', 'Sem retorno', 'Aguardando pagamento', 'Aguardando documentos',
    'Venda finalizada', 'Venda declinada', 'Judicialização', 'Doação', 'Óbito', 'Amostra',
  ],
  lead: ['Primeira compra', 'Recompra', 'Envio lote atualizado', 'Envio pendência'],
  formaEnvio: [
    'Loggi', 'TriStar', 'Motoboy', 'SEDEX', 'SEDEX 10', 'SEDEX 12',
    'PAC', 'Uber', 'Em mãos', 'Via Euclides', 'Jadlog',
  ],
  statusEnvio: [
    'Envio Pendente', 'Envio Realizado', 'Recebido', 'Extraviado',
    'Entrega Suspensa', 'Devolvido ao Remetente',
  ],
};

const PRODUCT_COL_MAP: { field: string; pattern: string; label: string }[] = [
  { field: 'qty3500', pattern: '3500', label: '3500+mg' },
  { field: 'qty5400', pattern: '5400', label: '5400+mg' },
  { field: 'qty7000', pattern: '7000', label: '7000+mg' },
  { field: 'qty1750', pattern: '1750', label: '1750+mg' },
  { field: 'qty2700', pattern: '2700', label: '2700+mg' },
  { field: 'qty4500', pattern: '4500', label: '4500+mg' },
  { field: 'qtyThcStrip', pattern: 'THC Oral Strip', label: 'THC Oral Strip - 10mg' },
];

const DATE_FIELDS = new Set(['dataVenda', 'dataOrcamento', 'dataEnvio', 'previsaoEntrega']);
const NUMERIC_FIELDS = new Set([
  'valorLiquido', 'valorLiquidoMenosFrete', 'usdbrl', 'priceList',
  'qty3500', 'qty5400', 'qty7000', 'qty1750', 'qty2700', 'qty4500', 'qtyThcStrip',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(v: string): number {
  if (!v || !v.trim()) return 0;
  // Handle Brazilian format: 1.234,56 → 1234.56
  const cleaned = v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDate(v: string): Date | null {
  if (!v || !v.trim()) return null;
  // Try YYYY-MM-DD
  let d = new Date(v.trim() + 'T12:00:00');
  if (!isNaN(d.getTime())) return d;
  // Try DD/MM/YYYY (Brazilian format)
  const match = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) {
    d = new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function autoDetectMapping(csvHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  for (const header of csvHeaders) {
    const n = normalize(header);
    for (const field of TARGET_FIELDS) {
      const fn = normalize(field.label);
      if (n === fn || n.includes(fn) || fn.includes(n)) {
        mapping[header] = field.value;
        break;
      }
    }
    // Specific fuzzy matches
    if (!mapping[header]) {
      if (n.includes('representante')) mapping[header] = 'representante';
      else if (n.includes('cliente') || n.includes('paciente')) mapping[header] = 'cliente';
      else if (n.includes('medico') || n.includes('médico')) mapping[header] = 'medico';
      else if (n.includes('crm') || n.includes('cro') || n.includes('rqe')) mapping[header] = 'crmCroRqe';
      else if (n.includes('telefone') || n.includes('celular') || n.includes('fone')) mapping[header] = 'telefone';
      else if (n.includes('email') || n.includes('e-mail')) mapping[header] = 'email';
      else if (n.includes('data venda') || n.includes('data da venda')) mapping[header] = 'dataVenda';
      else if (n.includes('orcamento') || n.includes('orçamento')) mapping[header] = 'dataOrcamento';
      else if (n.includes('invoice') && n.includes('correcao')) mapping[header] = 'invoiceCorrecao';
      else if (n.includes('invoice') || n.includes('fatura')) mapping[header] = 'invoice';
      else if (n.includes('3500')) mapping[header] = 'qty3500';
      else if (n.includes('5400')) mapping[header] = 'qty5400';
      else if (n.includes('7000')) mapping[header] = 'qty7000';
      else if (n.includes('1750')) mapping[header] = 'qty1750';
      else if (n.includes('2700')) mapping[header] = 'qty2700';
      else if (n.includes('4500')) mapping[header] = 'qty4500';
      else if (n.includes('thc') && n.includes('strip')) mapping[header] = 'qtyThcStrip';
      else if (n.includes('meio') && n.includes('pagamento')) mapping[header] = 'meioPagamento';
      else if (n.includes('valor liquido') && n.includes('frete')) mapping[header] = 'valorLiquidoMenosFrete';
      else if (n.includes('valor liquido') || n.includes('valor líquido')) mapping[header] = 'valorLiquido';
      else if (n.includes('usdbrl') || n.includes('cambio') || n.includes('câmbio')) mapping[header] = 'usdbrl';
      else if (n.includes('price list')) mapping[header] = 'priceList';
      else if (n.includes('status') && n.includes('orcamento')) mapping[header] = 'statusOrcamento';
      else if (n.includes('lead')) mapping[header] = 'lead';
      else if (n.includes('forma') && n.includes('envio')) mapping[header] = 'formaEnvio';
      else if (n.includes('endereco') || n.includes('endereço')) mapping[header] = 'endereco';
      else if (n.includes('cep')) mapping[header] = 'cep';
      else if (n.includes('lote')) mapping[header] = 'lote';
      else if (n.includes('data') && n.includes('envio')) mapping[header] = 'dataEnvio';
      else if (n.includes('previsao') || n.includes('previsão')) mapping[header] = 'previsaoEntrega';
      else if (n.includes('rastreio') || n.includes('tracking')) mapping[header] = 'codigoRastreio';
      else if (n.includes('status') && n.includes('envio')) mapping[header] = 'statusEnvio';
    }
  }
  return mapping;
}

interface RowError {
  row: number;
  field: string;
  message: string;
}

function validateRows(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): { errors: RowError[]; validCount: number; errorCount: number } {
  const errors: RowError[] = [];
  const reverseMap: Record<string, string> = {};
  for (const [csvCol, targetField] of Object.entries(mapping)) {
    if (targetField && targetField !== '_skip') reverseMap[targetField] = csvCol;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let hasError = false;

    // Validate dropdown fields
    for (const [field, validValues] of Object.entries(DROPDOWN_VALID_VALUES)) {
      const csvCol = reverseMap[field];
      if (!csvCol) continue;
      const val = (row[csvCol] ?? '').trim();
      if (val && !validValues.includes(val)) {
        errors.push({ row: i, field, message: `Valor inválido: "${val}"` });
        hasError = true;
      }
    }

    // Validate date fields
    for (const field of DATE_FIELDS) {
      const csvCol = reverseMap[field];
      if (!csvCol) continue;
      const val = (row[csvCol] ?? '').trim();
      if (val && !parseDate(val)) {
        errors.push({ row: i, field, message: `Data inválida: "${val}"` });
        hasError = true;
      }
    }

    // Validate numeric fields
    for (const field of NUMERIC_FIELDS) {
      const csvCol = reverseMap[field];
      if (!csvCol) continue;
      const val = (row[csvCol] ?? '').trim();
      if (val && isNaN(parseNumber(val))) {
        errors.push({ row: i, field, message: `Número inválido: "${val}"` });
        hasError = true;
      }
    }

    // At least one identity field
    const hasCliente = (row[reverseMap['cliente']] ?? '').trim();
    const hasRep = (row[reverseMap['representante']] ?? '').trim();
    if (!hasCliente && !hasRep) {
      errors.push({ row: i, field: 'cliente', message: 'Cliente ou Representante é obrigatório' });
      hasError = true;
    }

    if (hasError) continue;
  }

  const errorRows = new Set(errors.map((e) => e.row));
  return {
    errors,
    validCount: rows.length - errorRows.size,
    errorCount: errorRows.size,
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Step = 'upload' | 'mapping' | 'preview' | 'importing';

export default function ImportarPage() {
  const { firestore, user, isAdmin, isAdminLoading } = useFirebase();
  const { toast } = useToast();

  // Step state
  const [step, setStep] = useState<Step>('upload');

  // CSV data
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');

  // Column mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Validation
  const [validationResult, setValidationResult] = useState<{
    errors: RowError[];
    validCount: number;
    errorCount: number;
  } | null>(null);

  // Duplicate invoice check
  const [duplicateInvoices, setDuplicateInvoices] = useState<Set<string>>(new Set());

  // Import state
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importDone, setImportDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  // Product catalog (for matching product columns to stockProductIds)
  const productsQuery = useMemoFirebase(
    () => (firestore ? getActiveProductsQuery(firestore) : null),
    [firestore],
  );
  const { data: products } = useCollection<Product>(productsQuery);

  // File ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Admin gate ────────────────────────────────────────────────────────
  if (isAdminLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Carregando...</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-2 font-headline">Acesso restrito</h1>
        <p className="text-muted-foreground">
          Apenas administradores podem importar pedidos via CSV.
        </p>
      </div>
    );
  }

  // ── Step 1: Upload ────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const rows = result.data as Record<string, string>[];
        setCsvHeaders(headers);
        setCsvRows(rows);

        // Auto-detect mapping
        const saved = localStorage.getItem(STORAGE_KEY);
        let initialMapping: Record<string, string>;
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Record<string, string>;
            // Verify saved mapping keys match current CSV headers
            const matchCount = headers.filter((h) => parsed[h]).length;
            initialMapping =
              matchCount > headers.length / 2 ? parsed : autoDetectMapping(headers);
          } catch {
            initialMapping = autoDetectMapping(headers);
          }
        } else {
          initialMapping = autoDetectMapping(headers);
        }
        setMapping(initialMapping);
        setStep('mapping');
      },
      error: (err) => {
        toast({
          title: 'Erro ao ler CSV',
          description: err.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFileSelect(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ── Step 2: Mapping ──────────────────────────────────────────────────
  const handleMappingChange = (csvCol: string, targetField: string) => {
    setMapping((prev) => ({ ...prev, [csvCol]: targetField }));
  };

  const handleMappingConfirm = async () => {
    // Save mapping to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));

    // Validate
    const result = validateRows(csvRows, mapping);
    setValidationResult(result);

    // Check for duplicate invoices
    const reverseMap: Record<string, string> = {};
    for (const [csvCol, tf] of Object.entries(mapping)) {
      if (tf && tf !== '_skip') reverseMap[tf] = csvCol;
    }

    const invoiceCol = reverseMap['invoice'];
    if (invoiceCol && firestore) {
      const invoices = csvRows
        .map((r) => (r[invoiceCol] ?? '').trim())
        .filter(Boolean);

      if (invoices.length > 0) {
        // Check existing orders for matching invoices (batch of 10 for Firestore 'in' limit)
        const dupes = new Set<string>();
        for (let i = 0; i < invoices.length; i += 10) {
          const batch = invoices.slice(i, i + 10);
          try {
            const q = query(
              collection(firestore, 'orders'),
              where('invoice', 'in', batch),
            );
            const snap = await getDocs(q);
            snap.docs.forEach((d) => {
              const inv = d.data().invoice;
              if (inv) dupes.add(inv);
            });
          } catch {
            // Ignore query errors
          }
        }
        setDuplicateInvoices(dupes);
      }
    }

    setStep('preview');
  };

  // ── Step 4: Import ────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!firestore || !user) return;

    setStep('importing');
    const batchImportId = crypto.randomUUID();

    // Build reverse mapping
    const reverseMap: Record<string, string> = {};
    for (const [csvCol, tf] of Object.entries(mapping)) {
      if (tf && tf !== '_skip') reverseMap[tf] = csvCol;
    }

    const getVal = (row: Record<string, string>, field: string): string => {
      const col = reverseMap[field];
      return col ? (row[col] ?? '').trim() : '';
    };

    // Filter valid rows (skip rows with errors)
    const errorRowSet = new Set(validationResult?.errors.map((e) => e.row) ?? []);
    const validRows = csvRows.filter((_, i) => !errorRowSet.has(i));

    // Skip duplicate invoices
    const invoiceCol = reverseMap['invoice'];
    const rowsToImport = validRows.filter((row) => {
      if (!invoiceCol) return true;
      const inv = (row[invoiceCol] ?? '').trim();
      return !inv || !duplicateInvoices.has(inv);
    });

    setImportTotal(rowsToImport.length);
    setImportProgress(0);

    // Build product catalog lookup
    const productCatalog = (products ?? []).reduce(
      (acc, p) => {
        acc.set(p.id, p);
        return acc;
      },
      new Map<string, Product>(),
    );

    // Find product by concentration pattern
    const findProduct = (pattern: string): Product | null => {
      for (const p of productCatalog.values()) {
        if (p.name.includes(pattern) || (p.concentration ?? '').includes(pattern)) {
          return p;
        }
      }
      return null;
    };

    let imported = 0;

    // Process in chunks of 250 (each order may need ~5 docs, Firestore limit is 500)
    const CHUNK_SIZE = 80;

    for (let chunkStart = 0; chunkStart < rowsToImport.length; chunkStart += CHUNK_SIZE) {
      const chunk = rowsToImport.slice(chunkStart, chunkStart + CHUNK_SIZE);
      const batch = writeBatch(firestore);

      for (const row of chunk) {
        const orderId = doc(collection(firestore, 'orders')).id;
        const now = serverTimestamp();

        // Parse dates
        const dataVendaStr = getVal(row, 'dataVenda');
        const dataVendaDate = parseDate(dataVendaStr);
        const createdAt = dataVendaDate
          ? Timestamp.fromDate(dataVendaDate)
          : serverTimestamp();

        // Parse amount
        const amount = parseNumber(getVal(row, 'valorLiquido'));
        const exchangeRate = parseNumber(getVal(row, 'usdbrl'));

        // ── Order root document ──
        batch.set(doc(firestore, 'orders', orderId), {
          status: 'pending',
          invoice: getVal(row, 'invoice'),
          type: 'sale',
          currency: 'BRL',
          amount,
          discount: 0,
          legalGuardian: false,
          anvisaOption: '',
          anvisaStatus: '',
          zapsignDocId: '',
          zapsignStatus: '',
          exchangeRate: exchangeRate || null,
          exchangeRateDate: null,
          documentsComplete: false,
          tristarShipmentId: '',
          prescriptionDocId: '',
          createdById: user.uid,
          updatedById: user.uid,
          createdAt,
          updatedAt: now,
          // Controle fields
          invoiceCorrecao: getVal(row, 'invoiceCorrecao'),
          meioPagamento: getVal(row, 'meioPagamento'),
          statusOrcamento: getVal(row, 'statusOrcamento'),
          lead: getVal(row, 'lead'),
          formaEnvio: getVal(row, 'formaEnvio'),
          lote: getVal(row, 'lote'),
          dataEnvio: getVal(row, 'dataEnvio'),
          previsaoEntrega: getVal(row, 'previsaoEntrega'),
          codigoRastreio: getVal(row, 'codigoRastreio'),
          statusEnvio: getVal(row, 'statusEnvio'),
          dataOrcamento: getVal(row, 'dataOrcamento'),
          batchImportId,
        });

        // ── Customer subcollection ──
        const clienteName = getVal(row, 'cliente');
        if (clienteName) {
          batch.set(doc(collection(firestore, 'orders', orderId, 'customer')), {
            name: clienteName,
            document: '',
            userId: '',
            orderId,
            createdAt: now,
            updatedAt: now,
          });
        }

        // ── Representative subcollection ──
        const repName = getVal(row, 'representante');
        if (repName) {
          batch.set(doc(collection(firestore, 'orders', orderId, 'representative')), {
            name: repName,
            code: '',
            saleId: orderId,
            userId: '',
            createdAt: now,
            updatedAt: now,
          });
        }

        // ── Doctor subcollection ──
        const medicoName = getVal(row, 'medico');
        const crm = getVal(row, 'crmCroRqe');
        if (medicoName || crm) {
          batch.set(doc(collection(firestore, 'orders', orderId, 'doctor')), {
            name: medicoName,
            crm,
            userId: '',
            orderId,
            createdAt: now,
            updatedAt: now,
          });
        }

        // ── Products subcollection ──
        for (const pcol of PRODUCT_COL_MAP) {
          const qty = parseNumber(getVal(row, pcol.field));
          if (qty > 0) {
            const catalogProduct = findProduct(pcol.pattern);
            batch.set(doc(collection(firestore, 'orders', orderId, 'products')), {
              stockProductId: catalogProduct?.id ?? '',
              productName: catalogProduct?.name ?? pcol.label,
              quantity: qty,
              price: catalogProduct?.price ?? 0,
              discount: 0,
              orderId,
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        // ── Shipping subcollection ──
        const endereco = getVal(row, 'endereco');
        const cep = getVal(row, 'cep');
        if (endereco || cep) {
          batch.set(doc(collection(firestore, 'orders', orderId, 'shipping')), {
            tracking: getVal(row, 'codigoRastreio'),
            price: 0,
            insurance: false,
            insuranceValue: 0,
            orderId,
            address: {
              street: endereco,
              number: '',
              complement: '',
              neighborhood: '',
              city: '',
              state: '',
              country: 'Brasil',
              postalCode: cep,
            },
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      try {
        await batch.commit();
        imported += chunk.length;
        setImportProgress(imported);
      } catch (err) {
        console.error('[CSV Import] Batch write error:', err);
        toast({
          title: 'Erro na importação',
          description: `Falha no lote ${Math.floor(chunkStart / CHUNK_SIZE) + 1}. ${imported} pedidos importados até agora.`,
          variant: 'destructive',
        });
        break;
      }
    }

    setImportedCount(imported);
    setImportDone(true);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader title="Importar CSV" description="Importação em massa de pedidos para o Controle" />

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <Card>
          <CardContent className="pt-6">
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleInputChange}
              />
              <div className="text-4xl mb-3">📄</div>
              <p className="text-lg font-medium mb-1">
                Arraste um arquivo CSV aqui ou clique para selecionar
              </p>
              <p className="text-sm text-muted-foreground">
                Formato aceito: .csv com cabeçalho na primeira linha
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Column mapping ── */}
      {step === 'mapping' && (
        <Card>
          <CardHeader>
            <CardTitle>Mapeamento de Colunas</CardTitle>
            <p className="text-sm text-muted-foreground">
              {fileName} — {csvRows.length} linhas, {csvHeaders.length} colunas
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {csvHeaders.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[200px] truncate" title={header}>
                    {header}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <Select
                    value={mapping[header] ?? '_skip'}
                    onValueChange={(v) => handleMappingChange(header, v)}
                  >
                    <SelectTrigger className="w-[280px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_skip">— Ignorar —</SelectItem>
                      {TARGET_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping[header] && mapping[header] !== '_skip' && (
                    <Badge variant="secondary" className="text-xs">
                      {TARGET_FIELDS.find((f) => f.value === mapping[header])?.group}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Voltar
              </Button>
              <Button onClick={handleMappingConfirm}>
                Validar e Pré-visualizar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Preview & validate ── */}
      {step === 'preview' && validationResult && (
        <Card>
          <CardHeader>
            <CardTitle>Pré-visualização</CardTitle>
            <div className="flex gap-3 mt-2">
              <Badge variant="default">
                {validationResult.validCount} válidos
              </Badge>
              {validationResult.errorCount > 0 && (
                <Badge variant="destructive">
                  {validationResult.errorCount} com erros
                </Badge>
              )}
              {duplicateInvoices.size > 0 && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                  {duplicateInvoices.size} invoices duplicados (serão ignorados)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Error list */}
            {validationResult.errors.length > 0 && (
              <div className="mb-4 p-3 bg-destructive/5 border border-destructive/20 rounded-md">
                <p className="text-sm font-medium text-destructive mb-2">
                  Erros encontrados:
                </p>
                <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                  {validationResult.errors.slice(0, 50).map((e, i) => (
                    <li key={i} className="text-destructive">
                      Linha {e.row + 2}: [{TARGET_FIELDS.find((f) => f.value === e.field)?.label ?? e.field}] {e.message}
                    </li>
                  ))}
                  {validationResult.errors.length > 50 && (
                    <li className="text-muted-foreground">
                      ...e mais {validationResult.errors.length - 50} erros
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Preview table — first 10 rows */}
            <div className="overflow-x-auto mb-4">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[50px]">#</TableHead>
                    {csvHeaders
                      .filter((h) => mapping[h] && mapping[h] !== '_skip')
                      .slice(0, 12)
                      .map((h) => (
                        <TableHead key={h} className="min-w-[100px]">
                          {TARGET_FIELDS.find((f) => f.value === mapping[h])?.label ?? h}
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvRows.slice(0, 10).map((row, i) => {
                    const errorRows = new Set(validationResult.errors.filter((e) => e.row === i).map((e) => e.field));
                    return (
                      <TableRow key={i} className={errorRows.size > 0 ? 'bg-destructive/5' : ''}>
                        <TableCell>{i + 2}</TableCell>
                        {csvHeaders
                          .filter((h) => mapping[h] && mapping[h] !== '_skip')
                          .slice(0, 12)
                          .map((h) => (
                            <TableCell
                              key={h}
                              className={errorRows.has(mapping[h]) ? 'text-destructive font-medium' : ''}
                            >
                              {(row[h] ?? '').slice(0, 40) || '—'}
                            </TableCell>
                          ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {csvRows.length > 10 && (
              <p className="text-xs text-muted-foreground mb-4">
                Mostrando 10 de {csvRows.length} linhas
              </p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Voltar ao mapeamento
              </Button>
              <Button
                onClick={handleImport}
                disabled={validationResult.validCount === 0}
              >
                Importar {validationResult.validCount - duplicateInvoices.size} pedidos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Importing ── */}
      {step === 'importing' && (
        <Card>
          <CardContent className="pt-6">
            {!importDone ? (
              <div className="text-center py-8">
                <p className="text-lg font-medium mb-3">Importando pedidos...</p>
                <div className="w-full max-w-md mx-auto bg-muted rounded-full h-3 mb-2">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-300"
                    style={{ width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {importProgress} de {importTotal} pedidos
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-lg font-medium mb-2">Importação concluída</p>
                <p className="text-muted-foreground mb-6">
                  {importedCount} pedidos importados com sucesso.
                </p>
                <Button asChild>
                  <a href="/controle">Voltar ao Controle</a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
