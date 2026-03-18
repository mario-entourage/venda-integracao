'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { Download } from 'lucide-react';
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

const fmtDate = (ts: unknown) => {
  const t = ts as { seconds?: number } | null | undefined;
  if (!t?.seconds) return '—';
  return new Date(t.seconds * 1000).toLocaleDateString('pt-BR');
};

function sortByCreatedAtDesc(docs: DocumentRecord[]): DocumentRecord[] {
  return [...docs].sort((a, b) => {
    const aS = (a.createdAt as unknown as { seconds: number })?.seconds ?? 0;
    const bS = (b.createdAt as unknown as { seconds: number })?.seconds ?? 0;
    return bS - aS;
  });
}

// ─── component ───────────────────────────────────────────────────────────────

// Default date range: last 30 days
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

  // Admin → documents within date range; User → only their own (with date range)
  const docsQ = useMemoFirebase(
    () => {
      if (!firestore || !user) return null;
      const fromTs = Timestamp.fromDate(new Date(dateFrom + 'T00:00:00'));
      const toTs = Timestamp.fromDate(new Date(dateTo + 'T23:59:59.999'));
      const constraints = [
        where('createdAt', '>=', fromTs),
        where('createdAt', '<=', toTs),
        orderBy('createdAt', 'desc'),
        limit(500),
      ];
      if (isAdmin) return query(getDocumentsRef(firestore), ...constraints);
      return query(getDocumentsRef(firestore), where('userId', '==', user.uid), ...constraints);
    },
    [firestore, user, isAdmin, dateFrom, dateTo],
  );

  const { data: rawDocs, isLoading } = useCollection<DocumentRecord>(docsQ);

  // Load all active users so we can resolve "Uploaded by" from userId
  const usersQ = useMemoFirebase(
    () => (firestore ? getActiveUsersQuery(firestore) : null),
    [firestore],
  );
  const { data: allUsers } = useCollection<User>(usersQ);

  // userId → displayName lookup
  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of allUsers ?? []) {
      m.set(u.id, u.displayName || u.email || u.id);
    }
    return m;
  }, [allUsers]);

  // Apply type filter client-side (date range is now server-side)
  const docs = useMemo(() => {
    const sorted = sortByCreatedAtDesc(rawDocs ?? []);
    if (typeFilter === 'all') return sorted;
    return sorted.filter((d) => d.type === typeFilter);
  }, [rawDocs, typeFilter]);

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAdmin ? 'Todos os Documentos' : 'Meus Documentos'}
          </CardTitle>
          {!isLoading && (
            <CardDescription>
              {docs.length} documento{docs.length !== 1 ? 's' : ''} encontrado{docs.length !== 1 ? 's' : ''}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 px-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : docs.length === 0 ? (
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
                    <th className="pb-2 pl-6 text-left font-medium text-muted-foreground">Tipo</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Paciente</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Pedido</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground hidden md:table-cell">Médico</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground hidden lg:table-cell">Enviado por</th>
                    <th className="pb-2 text-center font-medium text-muted-foreground w-10"></th>
                    <th className="pb-2 pr-6 text-right font-medium text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const cfg = docTypeConfig(doc.type);
                    const doctorName = (doc.metadata?.doctorName as string) || '';
                    const uploaderName = doc.userId ? (userMap.get(doc.userId) ?? doc.userId.slice(0, 8)) : '—';
                    return (
                      <tr
                        key={doc.id}
                        className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => router.push(`/documentos/${doc.id}`)}
                      >
                        <td className="py-3 pl-6">
                          <Badge variant="outline" className={cfg.className}>
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {doc.holder || (doc.metadata?.fullName as string) || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3">
                          {doc.orderId ? (
                            <span
                              className="font-mono text-xs text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/controle/${doc.orderId}`);
                              }}
                            >
                              #{(doc.orderId as string).slice(0, 8).toUpperCase()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 hidden md:table-cell">
                          {doctorName || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 hidden lg:table-cell text-muted-foreground">
                          {uploaderName}
                        </td>
                        <td className="py-3 text-center">
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
                        <td className="py-3 pr-6 text-right text-muted-foreground">
                          {fmtDate(doc.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
