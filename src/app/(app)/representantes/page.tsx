'use client';

import { useRouter } from 'next/navigation';
import { useFirebase, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getActiveRepUsersQuery } from '@/services/users.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { ColumnDef } from '@/components/shared/data-table';
import type { User } from '@/types/user';

const columns: ColumnDef<User>[] = [
  {
    key: 'displayName',
    header: 'Nome',
    sortable: true,
    render: (item) => item.displayName || item.email,
  },
  {
    key: 'email',
    header: 'Email',
  },
  {
    key: 'groupId',
    header: 'Grupo',
    render: (item) => item.groupId === 'admin' ? 'Admin' : item.groupId === 'view_only' ? 'Somente Leitura' : 'Usuário',
  },
];

export default function RepresentantesPage() {
  const db = useFirestore();
  const router = useRouter();
  const { isAdmin } = useFirebase();

  const repUsersQuery = useMemoFirebase(
    () => getActiveRepUsersQuery(db),
    [db],
  );

  const { data: repUsers, isLoading } = useCollection<User>(repUsersQuery);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Representantes"
        action={isAdmin ? { label: 'Novo Representante', href: '/usuarios' } : undefined}
      />
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={repUsers || []}
            loading={isLoading}
            searchPlaceholder="Buscar por nome, email..."
            emptyMessage="Nenhum representante cadastrado ainda."
            onRowClick={(r) => router.push(`/usuarios/${r.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
