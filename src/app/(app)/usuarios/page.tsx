'use client';

import { useRouter } from 'next/navigation';
import { query, orderBy } from 'firebase/firestore';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getUsersRef } from '@/services/users.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { USER_GROUP_LABELS } from '@/lib/constants';
import { UserGroupType } from '@/types/enums';
import type { ColumnDef } from '@/components/shared/data-table';
import type { User } from '@/types';

const columns: ColumnDef<User>[] = [
  {
    key: 'document',
    header: 'CPF / CNPJ',
    sortable: true,
  },
  {
    key: 'groupId',
    header: 'Grupo',
    sortable: true,
    render: (item) =>
      USER_GROUP_LABELS[item.groupId as UserGroupType] || item.groupId,
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

export default function UsuariosPage() {
  const { isAdmin, isAdminLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();

  const usersQuery = useMemoFirebase(
    () => query(getUsersRef(db), orderBy('createdAt', 'desc')),
    [db],
  );

  const { data: users, isLoading } = useCollection<User>(usersQuery);

  if (isAdminLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold">Acesso Restrito</p>
        <p className="text-muted-foreground">
          Apenas administradores podem acessar esta area.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        action={{ label: 'Novo Usuario', href: '/usuarios/novo' }}
      />
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={users || []}
            loading={isLoading}
            searchPlaceholder="Buscar usuario..."
            emptyMessage="Nenhum usuario encontrado."
            onRowClick={(u) => router.push(`/usuarios/${u.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
