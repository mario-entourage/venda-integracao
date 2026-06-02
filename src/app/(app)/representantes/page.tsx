'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useFirebase, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { getActiveRepUsersQuery } from '@/services/users.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import type { ColumnDef } from '@/components/shared/data-table';
import type { User } from '@/types/user';

const columns: ColumnDef<User>[] = [
  {
    key: 'displayName',
    header: 'Nome',
    sortable: true,
    render: (item) => item.displayName || item.email || '—',
  },
  {
    key: 'email',
    header: 'Email',
    render: (item) => item.email || '—',
  },
  {
    key: 'state',
    header: 'UF',
    render: (item) => item.state || '—',
  },
  {
    key: 'tipo',
    header: 'Tipo',
    render: (item) =>
      item.external ? (
        <Badge variant="secondary">Externo</Badge>
      ) : (
        <Badge variant="outline">Interno</Badge>
      ),
  },
  {
    key: 'groupId',
    header: 'Grupo',
    render: (item) =>
      item.external
        ? '—'
        : item.groupId === 'admin'
          ? 'Admin'
          : item.groupId === 'view_only'
            ? 'Somente Leitura'
            : 'Usuário',
  },
];

export default function RepresentantesPage() {
  const db = useFirestore();
  const router = useRouter();
  const { isAdmin } = useFirebase();
  const authFetch = useAuthFetch();
  const { toast } = useToast();

  const repUsersQuery = useMemoFirebase(() => getActiveRepUsersQuery(db), [db]);
  const { data: repUsers, isLoading } = useCollection<User>(repUsersQuery);

  // ── Create external rep dialog ────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setState('');
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/admin/external-reps', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          state: state.trim().toUpperCase() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast({ title: 'Representante externo criado.' });
      setCreateOpen(false);
      resetForm();
    } catch (err) {
      toast({
        title: 'Falha ao criar representante externo',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Representantes">
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>Novo Representante</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push('/usuarios')}>
                Interno (Entourage Lab)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                Externo (sem login)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={repUsers || []}
            loading={isLoading}
            searchPlaceholder="Buscar por nome, email..."
            emptyMessage="Nenhum representante cadastrado ainda."
            exportFilename="representantes"
            onRowClick={(r) => {
              // External reps don't have a /usuarios/[id] page (they're not
              // managed through the normal user-admin flow); skip navigation.
              if (!r.external) router.push(`/usuarios/${r.id}`);
            }}
          />
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo representante externo</DialogTitle>
            <DialogDescription>
              Para representantes de fora da Entourage Lab. Não terão login —
              só ficam disponíveis para serem selecionados como vendedor em um
              pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ext-rep-name">Nome *</Label>
              <Input
                id="ext-rep-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo do representante"
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-rep-email">Email (opcional)</Label>
              <Input
                id="ext-rep-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@exemplo.com"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-rep-state">UF (opcional)</Label>
              <Input
                id="ext-rep-state"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                placeholder="SP"
                maxLength={2}
                className="uppercase max-w-[100px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
