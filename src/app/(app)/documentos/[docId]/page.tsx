'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase';
import { getDocumentRef } from '@/services/documents.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DocumentRecord } from '@/types';

// ─── type labels ─────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  prescription:         { label: 'Prescrição',            className: 'border-blue-300 text-blue-700 bg-blue-50' },
  identity:             { label: 'Identidade',            className: 'border-slate-300 text-slate-600 bg-slate-50' },
  medical_report:       { label: 'Laudo Médico',          className: 'border-teal-300 text-teal-700 bg-teal-50' },
  proof_of_address:     { label: 'Comprov. de Endereço', className: 'border-amber-300 text-amber-700 bg-amber-50' },
  invoice:              { label: 'Nota Fiscal',           className: 'border-orange-300 text-orange-700 bg-orange-50' },
  anvisa_authorization: { label: 'Autorização ANVISA',   className: 'border-green-300 text-green-700 bg-green-50' },
  general:              { label: 'Geral',                 className: 'border-gray-300 text-gray-600 bg-gray-50' },
};

function docTypeConfig(type: string) {
  return DOC_TYPE_LABELS[type] ?? { label: type || '—', className: 'border-muted text-muted-foreground bg-muted/30' };
}

// ─── metadata field labels ────────────────────────────────────────────────────

const METADATA_LABELS: Record<string, string> = {
  // File info
  fileName:         'Nome do Arquivo',
  // Patient / identity
  fullName:         'Nome Completo',
  rg:               'RG',
  cpf:              'CPF',
  birthDate:        'Data de Nascimento',
  // Address
  postalCode:       'CEP',
  street:           'Logradouro',
  streetNumber:     'Número',
  complement:       'Complemento',
  neighborhood:     'Bairro',
  city:             'Cidade',
  state:            'Estado',
  // Doctor (from prescription)
  doctorName:       'Nome do Médico',
  doctorCrm:        'CRM',
  doctorSpecialty:  'Especialidade',
  doctorState:      'Estado (Médico)',
  doctorCity:       'Cidade (Médico)',
  doctorPhone:      'Telefone (Médico)',
  doctorMobilePhone:'Celular (Médico)',
  doctorEmail:      'E-mail (Médico)',
  // Generic extras
  confidence:       'Confiança da Extração',
  documentType:     'Tipo Detectado',
};

/** Fields rendered specially — excluded from the generic metadata table. */
const HIDDEN_META_KEYS = new Set(['url']);

function isPdf(fileName: string) {
  return fileName.toLowerCase().endsWith('.pdf');
}

function isImage(fileName: string) {
  return /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(fileName);
}

function labelFor(key: string): string {
  return METADATA_LABELS[key] ?? key;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    // confidence score → percentage
    if (value >= 0 && value <= 1) return `${Math.round(value * 100)}%`;
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtDateTime = (ts: unknown) => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

// ─── field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm sm:col-span-2 sm:mt-0">{value ?? '—'}</dd>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DocumentDetailPage() {
  const { docId } = useParams<{ docId: string }>();
  const router = useRouter();
  const { firestore } = useFirebase();

  const docRef = useMemoFirebase(
    () => (firestore && docId ? getDocumentRef(firestore, docId) : null),
    [firestore, docId],
  );
  const { data: doc, isLoading } = useDoc<DocumentRecord>(docRef);

  // ── loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
        <div className="h-48 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/documentos')}>
          ← Voltar
        </Button>
        <p className="text-muted-foreground">Documento não encontrado.</p>
      </div>
    );
  }

  const typeCfg = docTypeConfig(doc.type);

  const fileUrl = doc.metadata?.url as string | undefined;
  const fileName = doc.metadata?.fileName as string | undefined;

  // Filter metadata entries — skip the url field (shown as embedded viewer instead)
  const metaEntries = Object.entries(doc.metadata ?? {}).filter(([k]) => !HIDDEN_META_KEYS.has(k));

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/documentos')}
          className="-ml-2"
        >
          ← Voltar
        </Button>
        <h1 className="font-headline text-2xl font-bold">Detalhe do Documento</h1>
        <Badge variant="outline" className={`ml-auto ${typeCfg.className}`}>
          {typeCfg.label}
        </Badge>
      </div>

      {/* ── File viewer ── */}
      {fileUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Documento</span>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-normal text-primary hover:underline"
              >
                Abrir em nova aba ↗
              </a>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-lg">
            {fileName && isPdf(fileName) ? (
              <iframe
                src={fileUrl}
                className="w-full border-0"
                style={{ height: '600px' }}
                title={fileName}
              />
            ) : fileName && isImage(fileName) ? (
              <img
                src={fileUrl}
                alt={fileName}
                className="w-full object-contain max-h-[600px]"
              />
            ) : (
              // Unknown type — show a download link
              <div className="px-6 py-4">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={fileName}
                  className="text-sm text-primary hover:underline"
                >
                  {fileName ?? 'Baixar documento'}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Core fields ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do Documento</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <FieldRow label="ID" value={<span className="font-mono text-xs">{doc.id}</span>} />
            <FieldRow label="Tipo" value={
              <Badge variant="outline" className={typeCfg.className}>
                {typeCfg.label}
              </Badge>
            } />
            <FieldRow label="Titular (Cliente)" value={doc.holder || '—'} />
            <FieldRow label="Chave / Referência" value={doc.key || '—'} />
            <FieldRow label="Número do Documento" value={doc.number || '—'} />
            <FieldRow label="Pedido Vinculado" value={
              doc.orderId ? (
                <button
                  className="font-mono text-xs text-primary hover:underline"
                  onClick={() => router.push(`/controle/${doc.orderId}`)}
                >
                  #{(doc.orderId as string).slice(0, 8).toUpperCase()} →
                </button>
              ) : '—'
            } />
            <FieldRow label="Enviado por (userId)" value={
              <span className="font-mono text-xs">{doc.userId || '—'}</span>
            } />
            <FieldRow label="Criado em" value={fmtDateTime(doc.createdAt)} />
            <FieldRow label="Atualizado em" value={fmtDateTime(doc.updatedAt)} />
          </dl>
        </CardContent>
      </Card>

      {/* ── Extracted metadata ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos Extraídos</CardTitle>
        </CardHeader>
        <CardContent>
          {metaEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum campo extraído disponível para este documento. O arquivo pode ter sido enviado sem extração automática de dados.
            </p>
          ) : (
            <dl className="divide-y">
              {metaEntries.map(([key, value]) => (
                <FieldRow
                  key={key}
                  label={labelFor(key)}
                  value={formatValue(value)}
                />
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
