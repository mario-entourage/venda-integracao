'use client';

import { useRouter } from 'next/navigation';
import { query, orderBy, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getUsersRef, updateUser, getPreregistrationsRef } from '@/services/users.service';
import type { Preregistration } from '@/services/users.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { USER_GROUP_LABELS } from '@/lib/constants';
import { UserGroupType } from '@/types/enums';
import type { ColumnDef } from '@/components/shared/data-table';
import type { User } from '@/types';

const GROUP_OPTIONS = [
  { value: 'user', label: 'Usuario' },
  { value: 'admin', label: 'Administrador' },
  { value: 'view_only', label: 'Somente Visualizacao' },
];

const STATUS_OPTIONS = [
  { value: 'true', label: 'Ativo' },
  { value: 'false', label: 'Inativo' },
];

function formatGroupLabel(groupId: string): string {
  return (
    USER_GROUP_LABELS[groupId as UserGroupType] ||
    USER_GROUP_LABELS[groupId.toUpperCase() as UserGroupType] ||
    GROUP_OPTIONS.find((o) => o.value === groupId)?.label ||
    groupId
  );
}

function formatDate(ts: unknown): string {
  if (!ts) return '—';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString('pt-BR');
  }
  return '—';
}

function formatDateTime(ts: unknown): string {
  if (!ts) return '—';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return '—';
}

// A combined row type that can represent either an active user or a pending pre-registration
type UserRow = (User & { id: string; pending?: false }) | {
  id: string;
  email: string;
  groupId: string;
  active: boolean;
  pending: true;
  isRepresentante?: boolean;
  lastLogin?: undefined;
  createdAt: unknown;
};

export default function UsuariosPage() {
  const { user, isAdmin, isAdminLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const usersQuery = useMemoFirebase(
    () => query(getUsersRef(db), orderBy('createdAt', 'desc')),
    [db],
  );

  const preregQuery = useMemoFirebase(
    () => query(getPreregistrationsRef(db), orderBy('createdAt', 'desc')),
    [db],
  );

  const { data: users, isLoading } = useCollection<User>(usersQuery);
  const { data: preregistrations } = useCollection<Preregistration>(preregQuery);

  // Merge: show pre-registrations first (as pending rows), then actual users
  const allRows: UserRow[] = [
    ...(preregistrations || []).map((p) => ({
      id: p.id,
      email: p.email,
      groupId: p.groupId,
      active: false,
      pending: true as const,
      createdAt: p.createdAt,
    })),
    ...(users || []) as (User & { id: string })[],
  ];

  const handleGroupChange = async (userId: string, newGroup: string) => {
    try {
      await updateUser(db, userId, { groupId: newGroup }, user!.uid);

      // Sync roles_admin collection: create doc for admin, delete for non-admin
      const rolesRef = doc(db, 'roles_admin', userId);
      if (newGroup === 'admin') {
        await setDoc(rolesRef, { grantedAt: new Date().toISOString() });
      } else {
        await deleteDoc(rolesRef).catch(() => {
          // Doc may not exist — that's fine
        });
      }

      toast({ title: 'Grupo atualizado com sucesso.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar grupo.', variant: 'destructive' });
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await updateUser(db, userId, { active: newStatus === 'true' }, user!.uid);
      toast({ title: 'Status atualizado com sucesso.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar status.', variant: 'destructive' });
    }
  };

  const handleRepToggle = async (userId: string, isRep: boolean) => {
    try {
      await updateUser(db, userId, { isRepresentante: isRep }, user!.uid);
      toast({ title: isRep ? 'Marcado como representante.' : 'Representante removido.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar representante.', variant: 'destructive' });
    }
  };

  const adminColumns: ColumnDef<UserRow>[] = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
    },
    {
      key: 'groupId',
      header: 'Grupo',
      sortable: true,
      render: (item) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            value={item.groupId}
            onValueChange={(val) => handleGroupChange(item.id, val)}
            disabled={!!item.pending}
          >
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (item) => {
        if (item.pending) {
          return <Badge variant="secondary">Pendente</Badge>;
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              value={String(item.active)}
              onValueChange={(val) => handleStatusChange(item.id, val)}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      },
    },
    {
      key: 'isRepresentante',
      header: 'Representante',
      render: (item) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={!!item.isRepresentante}
            onCheckedChange={(val) => handleRepToggle(item.id, val)}
            disabled={!!item.pending}
          />
        </div>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Ultimo Login',
      sortable: true,
      render: (item) => <span className="text-sm">{formatDateTime(item.lastLogin)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Data de Criacao',
      sortable: true,
      render: (item) => <span className="text-sm">{formatDate(item.createdAt)}</span>,
    },
  ];

  const userColumns: ColumnDef<UserRow>[] = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
    },
    {
      key: 'groupId',
      header: 'Grupo',
      sortable: true,
      render: (item) => formatGroupLabel(item.groupId),
    },
    {
      key: 'active',
      header: 'Status',
      render: (item) => {
        if (item.pending) return <Badge variant="secondary">Pendente</Badge>;
        return (
          <Badge variant={item.active ? 'default' : 'destructive'}>
            {item.active ? 'Ativo' : 'Inativo'}
          </Badge>
        );
      },
    },
  ];

  if (isAdminLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const columns = isAdmin ? adminColumns : userColumns;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        {...(isAdmin ? { action: { label: 'Novo Usuario', href: '/usuarios/novo' } } : {})}
      />
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={allRows}
            loading={isLoading}
            searchPlaceholder="Buscar usuario..."
            emptyMessage="Nenhum usuario encontrado."
            exportFilename="usuarios"
            {...(isAdmin ? {
              onRowClick: (u: UserRow) => {
                if (!u.pending) router.push(`/usuarios/${u.id}`);
              },
            } : {})}
          />
        </CardContent>
      </Card>
    </div>
  );
}
