"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, File, ListFilter, Plus, Trash2, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PatientRequest, AnvisaRequestStatus } from "@/types/anvisa";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";
import { collection, query, where, doc, updateDoc, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { ANVISA_ROUTES } from "@/lib/anvisa-routes";
import { ANVISA_COLLECTIONS } from "@/lib/anvisa-paths";
import { TablePagination } from "@/components/shared/table-pagination";
import { exportToCsv } from "@/lib/export-csv";


const statusMap: Record<AnvisaRequestStatus, { label: string; className: string }> = {
  PENDENTE: { label: "Pendente", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  EM_AJUSTE: { label: "Em Ajuste", className: "bg-blue-100 text-blue-800 border-blue-300" },
  EM_AUTOMACAO: { label: "Em Automação", className: "bg-purple-100 text-purple-800 border-purple-300" },
  CONCLUIDO: { label: "Concluído", className: "bg-green-100 text-green-800 border-green-300" },
  ERRO: { label: "Erro", className: "bg-red-100 text-red-800 border-red-300" },
};

function StatusBadge({ status }: { status: AnvisaRequestStatus }) {
  const { label, className } = statusMap[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

export function RequestTable() {
  const { firestore, user, isAdmin } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  // For single-delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<PatientRequest | null>(null);
  // Snapshot the target so it survives dialog close
  const [pendingDelete, setPendingDelete] = useState<PatientRequest | null>(null);

  // For batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Admin sees all non-deleted requests; regular users see only their own
  const requestsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    if (isAdmin) {
      return query(collection(firestore, ANVISA_COLLECTIONS.requests), where('softDeleted', '==', false));
    }
    return query(collection(firestore, ANVISA_COLLECTIONS.requests), where('ownerEmail', '==', user.email));
  }, [user, firestore, isAdmin]);

  const { data: requests, isLoading } = useCollection<PatientRequest>(requestsQuery);

  // Search filter + pagination
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);

  const filteredRequests = (requests ?? []).filter(
    (r) => !search.trim() || r.patientDisplayName?.toLowerCase().includes(search.toLowerCase()),
  );

  const paginatedRequests = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, currentPage, pageSize]);

  // Reset page when search changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setCurrentPage(0), [search]);

  const handleExportCsv = useCallback(() => {
    exportToCsv(filteredRequests, [
      { key: 'id', header: 'ID' },
      { key: 'patientDisplayName', header: 'Paciente' },
      { key: 'ownerEmail', header: 'Operador' },
      { key: 'status', header: 'Status', render: (r) => statusMap[r.status]?.label ?? r.status },
      { key: 'createdAt', header: 'Criado em', render: (r) => new Date(r.createdAt).toLocaleDateString('pt-BR') },
      { key: 'updatedAt', header: 'Atualizado em', render: (r) => new Date(r.updatedAt).toLocaleDateString('pt-BR') },
    ], 'solicitacoes-anvisa');
  }, [filteredRequests]);

  const handleSoftDelete = useCallback(async (request: PatientRequest) => {
    if (!firestore) return;
    setIsDeleting(true);
    try {
      const requestRef = doc(firestore, ANVISA_COLLECTIONS.requests, request.id);
      await updateDoc(requestRef, { softDeleted: true, updatedAt: new Date().toISOString() });
      toast({ title: "Solicitacao excluida", description: `A solicitacao de ${request.patientDisplayName} foi movida para a lixeira.` });
    } catch (error) {
      console.error("Error soft-deleting request:", error);
      toast({ variant: "destructive", title: "Erro", description: "Nao foi possivel excluir a solicitacao." });
    } finally {
      setIsDeleting(false);
    }
  }, [firestore, toast]);

  const handleBatchDelete = useCallback(async () => {
    if (!firestore || selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(firestore);
      const now = new Date().toISOString();
      for (const id of selectedIds) {
        const requestRef = doc(firestore, ANVISA_COLLECTIONS.requests, id);
        batch.update(requestRef, { softDeleted: true, updatedAt: now });
      }
      await batch.commit();
      toast({ title: "Solicitacoes excluidas", description: `${selectedIds.size} solicitacao(oes) movida(s) para a lixeira.` });
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Error batch-deleting requests:", error);
      toast({ variant: "destructive", title: "Erro", description: "Nao foi possivel excluir as solicitacoes." });
    } finally {
      setIsDeleting(false);
      setShowBatchDeleteDialog(false);
    }
  }, [firestore, selectedIds, toast]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!requests) return;
    if (selectedIds.size === requests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(requests.map(r => r.id)));
    }
  };

  const handleAddRow = () => {
    router.push(ANVISA_ROUTES.newRequest);
  };

  // When admin opens single-delete dialog, snapshot the target
  const openDeleteDialog = (request: PatientRequest) => {
    setPendingDelete(request);
    setDeleteTarget(request);
  };

  const confirmSingleDelete = async () => {
    if (pendingDelete) {
      await handleSoftDelete(pendingDelete);
    }
    setDeleteTarget(null);
    setPendingDelete(null);
  };

  const cancelSingleDelete = () => {
    setDeleteTarget(null);
    setPendingDelete(null);
  };

  return (
    <>
    <Tabs defaultValue="all">
      <div className="flex items-center">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="active">Ativas</TabsTrigger>
          <TabsTrigger value="draft">Rascunho</TabsTrigger>
          <TabsTrigger value="archived" className="hidden sm:flex">
            Arquivadas
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1"
              onClick={() => setShowBatchDeleteDialog(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Excluir ({selectedIds.size})
              </span>
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={handleAddRow} className="h-8 gap-1">
              <Plus className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Nova Solicitacao</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Filtrar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filtrar por</DropdownMenuLabel>
              <DropdownMenuItem>Status</DropdownMenuItem>
              <DropdownMenuItem>Data</DropdownMenuItem>
              <DropdownMenuItem>Operador</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleExportCsv}>
            <File className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Exportar CSV</span>
          </Button>
        </div>
      </div>
      <TabsContent value="all">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{isAdmin ? 'Todas as Solicitacoes' : 'Minhas Solicitacoes'}</CardTitle>
                <CardDescription>
                  {isAdmin
                    ? 'Gerencie todas as solicitacoes de pacientes de todos os operadores.'
                    : 'Gerencie e acompanhe todas as suas solicitacoes de pacientes.'
                  }
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar paciente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={!!requests && requests.length > 0 && selectedIds.size === requests.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Selecionar todas"
                      />
                    </TableHead>
                  )}
                  <TableHead>ID da Solicitacao</TableHead>
                  <TableHead>Paciente</TableHead>
                  {isAdmin && <TableHead>Operador</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Criado em</TableHead>
                  <TableHead className="hidden md:table-cell">Atualizado em</TableHead>
                  <TableHead>
                    <span className="sr-only">Acoes</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 6} className="text-center">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && paginatedRequests.map((request) => (
                  <TableRow key={request.id} className={selectedIds.has(request.id) ? 'bg-muted/50' : undefined}>
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(request.id)}
                          onCheckedChange={() => toggleSelect(request.id)}
                          aria-label={`Selecionar ${request.patientDisplayName}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <Link href={ANVISA_ROUTES.requestDetail(request.id)} className="hover:underline text-primary">
                        {request.id}
                      </Link>
                    </TableCell>
                    <TableCell>{request.patientDisplayName}</TableCell>
                    {isAdmin && <TableCell className="text-sm text-muted-foreground">{request.ownerEmail}</TableCell>}
                    <TableCell>
                      <StatusBadge status={request.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {new Date(request.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                        {new Date(request.updatedAt).toLocaleString("pt-BR", { dateStyle: 'short', timeStyle: 'short' })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Acoes</DropdownMenuLabel>
                          <Link href={ANVISA_ROUTES.requestDetail(request.id)} passHref>
                            <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                          </Link>
                          <DropdownMenuItem>Reprocessar</DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => openDeleteDialog(request)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && filteredRequests.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={isAdmin ? 8 : 6} className="text-center">Nenhuma solicitacao encontrada.</TableCell>
                   </TableRow>
                 )}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="p-0">
            {!isLoading && filteredRequests.length > 0 && (
              <TablePagination
                totalItems={filteredRequests.length}
                currentPage={currentPage}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                itemLabel="solicitações"
                onExport={handleExportCsv}
              />
            )}
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>

    {/* Single-delete confirmation dialog */}
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) cancelSingleDelete(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir solicitacao?</AlertDialogTitle>
          <AlertDialogDescription>
            A solicitacao de <strong>{pendingDelete?.patientDisplayName}</strong> sera movida para a lixeira.
            Voce podera restaura-la posteriormente na pagina de lixeira do admin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirmSingleDelete}
          >
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Batch-delete confirmation dialog */}
    <AlertDialog open={showBatchDeleteDialog} onOpenChange={(open) => { if (!open) setShowBatchDeleteDialog(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {selectedIds.size} solicitacao(oes)?</AlertDialogTitle>
          <AlertDialogDescription>
            As solicitacoes selecionadas serao movidas para a lixeira.
            Voce podera restaura-las posteriormente na pagina de lixeira do admin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleBatchDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Excluir {selectedIds.size} solicitacao(oes)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
