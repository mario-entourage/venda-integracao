'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { Download, ChevronRight, ChevronDown, Search } from 'lucide-react';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getDocumentsRef } from '@/services/documents.service';
import { getActiveUsersQuery } from '@/services/users.service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TablePagination } from '@/components/shared/table-pagination';
import { exportToCsv } from '@/lib/export-csv';
import { getPatientName, matchesSearch, getPrescriptionExpiry, markArchivedDocs } from '@/lib/document-helpers';
import type { ExpiryStatus } from '@/lib/document-helpers';
import type { DocumentRecord } from '@/types';
import type { User } from '@/types';

// ─── type labels ─────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  prescription:         { label: 'Prescrição',             className: 'border-blue-300 text-blue-700 bg-blue-50' },
  identity:             { label: 'Identidade',             className: 'border-slate-300 text-slate-600 bg-slate-50' },
  medical_report:       { label: 'Laudo Médico',           className: 'border-teal-300 text-teal-700 bg-teal-50' },
  proof_of_address:     { label: 'Comprov. de Endereço',  className: 'border-amber-300 text-amber-700 bg-amber-50' },
  invoice:              { label: 'Nota Fiscal',            className: 'border-orange-300 text-orange-700 bg-orange-50' },
  anvisa_authorization: { label: 'Autorização ANVISA',    className: 'border-green-300 text-green-700 bg-green-50' },
  general:              { label: 'Geral',                  className: 'border-gray-300 text-gray-600 bg-gray-50' },
};

function docTypeConfig(type: string) {
  return DOC_TYPE_LABELS[type] ?? { label: type || '—', className: 'border-muted text-muted-foreground bg-muted/30' };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const tsSeconds = (ts: unknown): number => {
  const t = ts as { seconds?: number } | null | undefined;
  return t?.seconds ?? 0;
};

const fmtDate = (ts: unknown) => {
  const s = tsSeconds(ts);
  if (!s) return '—';
  return new Date(s * 1000).toLocaleDateString('pt-BR');
};

// ─── patient group type ──────────────────────────────────────────────────────

interface PatientGroup {
  /** Display name for the patient row */
  patientName: string;
  /** All documents belonging to this patient, sorted by date desc */
  docs: (DocumentRecord & { id: string })[];
  /** Most recent createdAt seconds — used for sorting groups */
  latestTs: number;
}

// ─── component ───────────────────────────────────────────────────────────────

const today = new Date();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);
const defaultTo = today.toISOString().slice(0, 10);

export default function DocumentosPage() {
  const router = useRouter();
  const { firestore, user, isAdmin } = useFirebase();

  // Filters
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Debounce search input (300ms)
  React.useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Firestore query — when searching, drop date constraints to find all docs
  const docsQ = useMemoFirebase(
    () => {
      if (!firestore || !user) return null;

      const constraints = [];
      if (!isAdmin) {
        constraints.push(where('userId', '==', user.uid));
      }

      if (searchTerm) {
        // Searching: fetch all docs (up to 500), no date filter
        constraints.push(orderBy('createdAt', 'desc'), limit(500));
      } else {
        // Normal: date-filtered
        const fromTs = Timestamp.fromDate(new Date(dateFrom + 'T00:00:00'));
        const toTs = Timestamp.fromDate(new Date(dateTo + 'T23:59:59.999'));
        constraints.push(
          where('createdAt', '>=', fromTs),
          where('createdAt', '<=', toTs),
          orderBy('createdAt', 'desc'),
          limit(500),
        );
      }

      return query(getDocumentsRef(firestore), ...constraints);
    },
    [firestore, user, isAdmin, dateFrom, dateTo, searchTerm],
  );

  const { data: rawDocs, isLoading } = useCollection<DocumentRecord>(docsQ);

  // Users for "Enviado por" lookup
  const usersQ = useMemoFirebase(
    () => (firestore ? getActiveUsersQuery(firestore) : null),
    [firestore],
  );
  const { data: allUsers } = useCollection<User>(usersQ);

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of allUsers ?? []) {
      m.set(u.id, u.displayName || u.email || u.id);
    }
    return m;
  }, [allUsers]);

  // Apply type filter + search filter, group by patient, mark archived + expiry
  const groups: PatientGroup[] = useMemo(() => {
    let filtered = rawDocs ?? [];
    if (typeFilter !== 'all') {
      filtered = filtered.filter((d) => d.type === typeFilter);
    }
    // Client-side search filter
    if (searchTerm) {
      filtered = filtered.filter((d) => matchesSearch(d, searchTerm));
    }

    // Group by patient name
    const map = new Map<string, (DocumentRecord & { id: string })[]>();
    for (const d of filtered) {
      const name = getPatientName(d);
      const arr = map.get(name) ?? [];
      arr.push(d as DocumentRecord & { id: string });
      map.set(name, arr);
    }

    // Build groups, sort docs within each group by date desc
    const result: PatientGroup[] = [];
    for (const [patientName, docs] of map) {
      // Mark archived prescriptions within each patient's docs
      const withArchive = markArchivedDocs(docs as (DocumentRecord & { id: string; prescriptionDate?: string })[]);

      // Sort: active docs first (by date desc), then archived (by date desc)
      withArchive.sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        return tsSeconds(b.createdAt) - tsSeconds(a.createdAt);
      });

      result.push({
        patientName,
        docs: withArchive,
        latestTs: tsSeconds(withArchive[0]?.createdAt),
      });
    }

    // Sort groups by most recent document date desc
    result.sort((a, b) => b.latestTs - a.latestTs);
    return result;
  }, [rawDocs, typeFilter, searchTerm]);

  const totalDocs = useMemo(() => groups.reduce((s, g) => s + g.docs.length, 0), [groups]);

  // Pagination over groups
  const paginatedGroups = useMemo(() => {
    const start = currentPage * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, currentPage, pageSize]);

  // Reset page when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setCurrentPage(0), [typeFilter, dateFrom, dateTo, searchTerm]);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleRowClick = (group: PatientGroup) => {
    if (group.docs.length === 1) {
      router.push(`/documentos/${group.docs[0].id}`);
    } else {
      toggleExpand(group.patientName);
    }
  };

  const handleExportCsv = () => {
    const allDocs = groups.flatMap((g) => g.docs);
    exportToCsv(allDocs, [
      { key: 'holder', header: 'Paciente', render: (d) => getPatientName(d, '') },
      { key: 'type', header: 'Tipo', render: (d) => docTypeConfig(d.type).label },
      { key: 'orderId', header: 'Pedido', render: (d) => d.orderId ? String(d.orderId).slice(0, 8).toUpperCase() : '' },
      { key: 'doctorName', header: 'Médico', render: (d) => (d.metadata?.doctorName as string) || '' },
      { key: 'userId', header: 'Enviado por', render: (d) => d.userId ? (userMap.get(d.userId) ?? d.userId.slice(0, 8)) : '' },
      { key: 'createdAt', header: 'Data', render: (d) => fmtDate(d.createdAt) },
    ], 'documentos');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Documentos</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? 'Todos os documentos processados na plataforma.'
            : 'Documentos que você enviou.'}
        </p>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por paciente..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-[240px] pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data — De</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data — Até</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(DOC_TYPE_LABELS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {searchTerm && (
            <p className="mt-3 text-xs text-muted-foreground">
              <Search className="inline h-3 w-3 mr-1" />
              Buscando em todos os registros
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAdmin ? 'Todos os Documentos' : 'Meus Documentos'}
          </CardTitle>
          {!isLoading && (
            <CardDescription>
              {totalDocs} documento{totalDocs !== 1 ? 's' : ''} de {groups.length} paciente{groups.length !== 1 ? 's' : ''}
            </CardDescription>
          )}
        </CardHeader>
        {!isLoading && (rawDocs?.length ?? 0) >= 500 && (
          <div className="mx-6 mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            Mostrando os 500 documentos mais recentes. Use os filtros para encontrar documentos mais antigos.
          </div>
        )}
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 px-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg
                className="mb-3 h-10 w-10 text-muted-foreground/40"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="text-sm font-medium text-muted-foreground">Nenhum documento encontrado</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Os documentos enviados durante o fluxo de vendas aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 pl-6 text-left font-medium text-muted-foreground">Paciente</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Tipo</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Pedido</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground hidden md:table-cell">Médico</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground hidden lg:table-cell">Enviado por</th>
                    <th className="pb-2 text-center font-medium text-muted-foreground w-10"></th>
                    <th className="pb-2 pr-6 text-right font-medium text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedGroups.map((group) => {
                    const isExpanded = expanded.has(group.patientName);
                    const isSingle = group.docs.length === 1;
                    const singleDoc = isSingle ? group.docs[0] : null;
                    const singleCfg = singleDoc ? docTypeConfig(singleDoc.type) : null;
                    const singleExpiry: ExpiryStatus | null =
                      singleDoc?.type === 'prescription'
                        ? getPrescriptionExpiry((singleDoc as typeof singleDoc & { prescriptionDate?: string }).prescriptionDate)
                        : null;

                    return (
                      <React.Fragment key={group.patientName}>
                        {/* ── Patient summary row ───────────────────── */}
                        <tr
                          className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                          onClick={() => handleRowClick(group)}
                        >
                          <td className="py-3 pl-6 font-medium">
                            <div className="flex items-center gap-2">
                              {!isSingle && (
                                isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              {group.patientName}
                            </div>
                          </td>
                          <td className="py-3">
                            {isSingle && singleCfg ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant="outline" className={singleCfg.className}>
                                  {singleCfg.label}
                                </Badge>
                                {singleExpiry === 'expiring' && (
                                  <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-[10px]">
                                    Vencendo
                                  </Badge>
                                )}
                                {singleExpiry === 'expired' && (
                                  <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[10px]">
                                    Vencida
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                {group.docs.length} documentos
                              </span>
                            )}
                          </td>
                          {/* Pedido, Médico, Enviado por — empty when collapsed with multiple docs */}
                          <td className="py-3">
                            {singleDoc?.orderId ? (
                              <span
                                className="font-mono text-xs text-primary hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/controle/${singleDoc.orderId}`);
                                }}
                              >
                                #{String(singleDoc.orderId).slice(0, 8).toUpperCase()}
                              </span>
                            ) : !isSingle ? null : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 hidden md:table-cell">
                            {singleDoc ? (
                              (singleDoc.metadata?.doctorName as string) || <span className="text-muted-foreground">—</span>
                            ) : null}
                          </td>
                          <td className="py-3 hidden lg:table-cell text-muted-foreground">
                            {singleDoc ? (
                              singleDoc.userId ? (userMap.get(singleDoc.userId) ?? singleDoc.userId.slice(0, 8)) : '—'
                            ) : null}
                          </td>
                          <td className="py-3 text-center">
                            {singleDoc?.metadata?.url ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                asChild
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a href={singleDoc.metadata.url as string} target="_blank" rel="noopener noreferrer" download>
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : null}
                          </td>
                          <td className="py-3 pr-6 text-right text-muted-foreground">
                            {fmtDate(group.docs[0]?.createdAt)}
                          </td>
                        </tr>

                        {/* ── Expanded child rows ───────────────────── */}
                        {isExpanded && group.docs.map((doc) => {
                          const cfg = docTypeConfig(doc.type);
                          const doctorName = (doc.metadata?.doctorName as string) || '';
                          const uploaderName = doc.userId ? (userMap.get(doc.userId) ?? doc.userId.slice(0, 8)) : '—';
                          const isArchived = (doc as typeof doc & { archived?: boolean }).archived;
                          const expiry: ExpiryStatus | null =
                            doc.type === 'prescription'
                              ? getPrescriptionExpiry((doc as typeof doc & { prescriptionDate?: string }).prescriptionDate)
                              : null;
                          return (
                            <tr
                              key={doc.id}
                              className={`border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors ${
                                isArchived ? 'bg-muted/10 opacity-60' : 'bg-muted/20'
                              }`}
                              onClick={() => router.push(`/documentos/${doc.id}`)}
                            >
                              <td className="py-2.5 pl-12 text-muted-foreground text-xs">
                                {(doc.metadata?.fileName as string) || doc.key || '—'}
                              </td>
                              <td className="py-2.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className={cfg.className}>
                                    {cfg.label}
                                  </Badge>
                                  {isArchived && (
                                    <Badge variant="outline" className="border-slate-300 text-slate-500 bg-slate-50 text-[10px]">
                                      Arquivado
                                    </Badge>
                                  )}
                                  {expiry === 'expiring' && (
                                    <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-[10px]">
                                      Vencendo
                                    </Badge>
                                  )}
                                  {expiry === 'expired' && (
                                    <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[10px]">
                                      Vencida
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5">
                                {doc.orderId ? (
                                  <span
                                    className="font-mono text-xs text-primary hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/controle/${doc.orderId}`);
                                    }}
                                  >
                                    #{String(doc.orderId).slice(0, 8).toUpperCase()}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                              <td className="py-2.5 hidden md:table-cell">
                                {doctorName || <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2.5 hidden lg:table-cell text-muted-foreground">
                                {uploaderName}
                              </td>
                              <td className="py-2.5 text-center">
                                {doc.metadata?.url ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    asChild
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <a href={doc.metadata.url as string} target="_blank" rel="noopener noreferrer" download>
                                      <Download className="h-4 w-4" />
                                    </a>
                                  </Button>
                                ) : null}
                              </td>
                              <td className="py-2.5 pr-6 text-right text-muted-foreground">
                                {fmtDate(doc.createdAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && groups.length > 0 && (
            <TablePagination
              totalItems={groups.length}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemLabel="pacientes"
              onExport={handleExportCsv}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
