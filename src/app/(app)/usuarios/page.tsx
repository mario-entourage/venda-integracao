'use client';

import { useRouter } from 'next/navigation';
import { query, orderBy } from 'firebase/firestore';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getUsersRef, updateUser } from '@/services/users.service';
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

export default function UsuariosPage() {
  const { isAdmin, isAdminLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const usersQuery = useMemoFirebase(
    () => query(getUsersRef(db), orderBy('createdAt', 'desc')),
    [db],
  );

  const { data: users, isLoading } = useCollection<User>(usersQuery);

  const handleGroupChange = async (userId: string, newGroup: string) => {
    try {
      await updateUser(db, userId, { groupId: newGroup });
      toast({ title: 'Grupo atualizado com sucesso.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar grupo.', variant: 'destructive' });
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await updateUser(db, userId, { active: newStatus === 'true' });
      toast({ title: 'Status atualizado com sucesso.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar status.', variant: 'destructive' });
    }
  };

  const adminColumns: ColumnDef<User>[] = [
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
      render: (item) => (
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

  const userColumns: ColumnDef<User>[] = [
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
      render: (item) => (
        <Badge variant={item.active ? 'default' : 'destructive'}>
          {item.active ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
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
            data={users || []}
            loading={isLoading}
            searchPlaceholder="Buscar usuario..."
            emptyMessage="Nenhum usuario encontrado."
            {...(isAdmin ? { onRowClick: (u: User) => router.push(`/usuarios/${u.id}`) } : {})}
          />
        </CardContent>
      </Card>
    </div>
  );
}
