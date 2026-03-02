'use client';

import { useRouter } from 'next/navigation';
import { useFirebase, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getActiveRepresentantesQuery } from '@/services/representantes.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { ColumnDef } from '@/components/shared/data-table';
import type { Representante } from '@/types/representante';

const columns: ColumnDef<Representante>[] = [
  {
    key: 'name',
    header: 'Nome',
    sortable: true,
  },
  {
    key: 'code',
    header: 'Código',
    sortable: true,
  },
  {
    key: 'email',
    header: 'Email',
    render: (item) => item.email || '—',
  },
  {
    key: 'phone',
    header: 'Telefone',
    render: (item) => item.phone || '—',
  },
];

export default function RepresentantesPage() {
  const db = useFirestore();
  const router = useRouter();
  const { isAdmin } = useFirebase();

  const representantesQuery = useMemoFirebase(
    () => getActiveRepresentantesQuery(db),
    [db],
  );

  const { data: representantes, isLoading } = useCollection<Representante>(representantesQuery);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Representantes"
        action={isAdmin ? { label: 'Novo Representante', href: '/representantes/novo' } : undefined}
      />
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={representantes || []}
            loading={isLoading}
            searchPlaceholder="Buscar por nome, código..."
            emptyMessage="Nenhum representante cadastrado ainda."
            onRowClick={(r) => router.push(`/representantes/${r.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
