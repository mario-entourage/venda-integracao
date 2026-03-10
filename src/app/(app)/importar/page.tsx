'use client';

import React, { useState, useRef } from 'react';
import {
  collection, doc, writeBatch, serverTimestamp, Timestamp, getDocs, query, where,
} from 'firebase/firestore';
import Papa from 'papaparse';
import { useFirebase } from '@/firebase/provider';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  type ImportEntityType,
  ENTITY_CONFIG,
  transformDoctorRow,
  transformClientRow,
  transformUserRow,
  type RowValidation,
} from '@/lib/csv-processors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'upload' | 'preview' | 'importing';

interface ValidationRow {
  index: number;
  data: Record<string, string>;
  validation: RowValidation;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportarPage() {
  const { firestore, user, isAdmin, isAdminLoading } = useFirebase();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entityType, setEntityType] = useState<ImportEntityType>('doctors');
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importDone, setImportDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const config = ENTITY_CONFIG[entityType];

  // Admin gate
  if (isAdminLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Acesso restrito</h1>
        <p className="text-muted-foreground">Apenas administradores podem importar dados via CSV.</p>
      </div>
    );
  }

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed = (result.data as Record<string, string>[]).map((data, index) => ({
          index,
          data,
          validation: config.validate(data),
        }));
        setRows(parsed);
        setStep('preview');
      },
      error: (err) => {
        toast({ title: 'Erro ao ler CSV', description: err.message, variant: 'destructive' });
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv'))) handleFileSelect(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const validRows = rows.filter((r) => r.validation.valid);
  const errorRows = rows.filter((r) => !r.validation.valid);

  // ── Import logic ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!firestore || !user) return;
    setStep('importing');
    setImportTotal(validRows.length);
    setImportProgress(0);

    let imported = 0;
    const CHUNK_SIZE = 80;

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      const now = serverTimestamp();

      for (const { data } of chunk) {
        if (entityType === 'doctors') {
          const transformed = transformDoctorRow(data);
          const { repUserEmail, ...doctorData } = transformed;

          // If repUserEmail provided, look up user ID
          let repUserId: string | undefined;
          if (repUserEmail) {
            try {
              const q = query(
                collection(firestore, 'users'),
                where('email', '==', repUserEmail.toLowerCase()),
              );
              const snap = await getDocs(q);
              if (!snap.empty) repUserId = snap.docs[0].id;
            } catch { /* ignore */ }
          }

          const ref = doc(collection(firestore, 'doctors'));
          batch.set(ref, {
            ...doctorData,
            ...(repUserId ? { repUserId } : {}),
            createdAt: now,
            updatedAt: now,
          });
        } else if (entityType === 'clients') {
          const transformed = transformClientRow(data);
          const { birthDate, ...rest } = transformed;
          const ref = doc(collection(firestore, 'clients'));
          batch.set(ref, {
            ...rest,
            birthDate: birthDate ? Timestamp.fromDate(birthDate) : null,
            createdAt: now,
            updatedAt: now,
          });
        } else if (entityType === 'users') {
          const { user: userData, profile } = transformUserRow(data);

          // Create preregistration so user gets flags on first login
          const ref = doc(collection(firestore, 'preregistrations'));
          batch.set(ref, {
            email: userData.email,
            displayName: userData.displayName,
            groupId: userData.groupId,
            isRepresentante: userData.isRepresentante,
            profileData: profile,
            createdAt: now,
          });
        }
      }

      try {
        await batch.commit();
        imported += chunk.length;
        setImportProgress(imported);
      } catch (err) {
        console.error('[CSV Import] Batch error:', err);
        toast({
          title: 'Erro na importação',
          description: `Falha no lote. ${imported} registros importados.`,
          variant: 'destructive',
        });
        break;
      }
    }

    setImportedCount(imported);
    setImportDone(true);
  };

  const reset = () => {
    setStep('upload');
    setRows([]);
    setFileName('');
    setImportDone(false);
    setImportProgress(0);
    setImportTotal(0);
    setImportedCount(0);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader title="Importar CSV" description="Importação em massa de dados" />

      {/* Entity type selector */}
      {step === 'upload' && (
        <Tabs value={entityType} onValueChange={(v) => setEntityType(v as ImportEntityType)}>
          <TabsList>
            <TabsTrigger value="doctors">Médicos</TabsTrigger>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
            <TabsTrigger value="users">Usuários</TabsTrigger>
          </TabsList>

          {(['doctors', 'clients', 'users'] as const).map((type) => (
            <TabsContent key={type} value={type}>
              <Card>
                <CardHeader>
                  <CardTitle>Importar {ENTITY_CONFIG[type].label}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Colunas esperadas: {ENTITY_CONFIG[type].columns.map((c) => ENTITY_CONFIG[type].columnLabels[c]).join(', ')}
                  </p>
                </CardHeader>
                <CardContent>
                  <div
                    className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.tsv"
                      className="hidden"
                      onChange={handleInputChange}
                    />
                    <p className="text-lg font-medium mb-1">
                      Arraste um arquivo CSV aqui ou clique para selecionar
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Formato: CSV com cabeçalho na primeira linha
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Pré-visualização — {config.label}</CardTitle>
            <div className="flex gap-3 mt-2">
              <p className="text-sm text-muted-foreground">{fileName} — {rows.length} linhas</p>
              <Badge variant="default">{validRows.length} válidos</Badge>
              {errorRows.length > 0 && (
                <Badge variant="destructive">{errorRows.length} com erros</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Errors */}
            {errorRows.length > 0 && (
              <div className="mb-4 p-3 bg-destructive/5 border border-destructive/20 rounded-md">
                <p className="text-sm font-medium text-destructive mb-2">Erros:</p>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {errorRows.slice(0, 30).map((r) => (
                    <li key={r.index} className="text-destructive">
                      Linha {r.index + 2}: {r.validation.errors.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview table */}
            <div className="overflow-x-auto mb-4">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    {config.columns.slice(0, 8).map((col) => (
                      <TableHead key={col}>{config.columnLabels[col]}</TableHead>
                    ))}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 15).map((r) => (
                    <TableRow key={r.index} className={r.validation.valid ? '' : 'bg-destructive/5'}>
                      <TableCell>{r.index + 2}</TableCell>
                      {config.columns.slice(0, 8).map((col) => (
                        <TableCell key={col}>{(r.data[col] ?? '').slice(0, 30) || '—'}</TableCell>
                      ))}
                      <TableCell>
                        {r.validation.valid ? (
                          <Badge variant="secondary" className="text-[10px]">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Erro</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset}>Voltar</Button>
              <Button onClick={handleImport} disabled={validRows.length === 0}>
                Importar {validRows.length} {config.label.toLowerCase()}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="pt-6">
            {!importDone ? (
              <div className="text-center py-8">
                <p className="text-lg font-medium mb-3">Importando {config.label.toLowerCase()}...</p>
                <div className="w-full max-w-md mx-auto bg-muted rounded-full h-3 mb-2">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-300"
                    style={{ width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {importProgress} de {importTotal}
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-lg font-medium mb-2">Importação concluída</p>
                <p className="text-muted-foreground mb-6">
                  {importedCount} {config.label.toLowerCase()} importados com sucesso.
                </p>
                <Button onClick={reset}>Nova importação</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
