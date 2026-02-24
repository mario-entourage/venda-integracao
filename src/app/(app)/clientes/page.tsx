'use client';

import { useRouter } from 'next/navigation';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getActiveClientsQuery } from '@/services/clients.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { ColumnDef } from '@/components/shared/data-table';
import type { Client } from '@/types/client';

const columns: ColumnDef<Client>[] = [
  {
    key: 'fullName',
    header: 'Nome',
    sortable: true,
  },
  {
    key: 'document',
    header: 'CPF / CNPJ',
    sortable: true,
  },
  {
    key: 'phone',
    header: 'Telefone',
    render: (item) => item.phone || '—',
  },
  {
    key: 'email',
    header: 'Email',
    render: (item) => item.email || '—',
  },
];

export default function ClientesPage() {
  const db = useFirestore();
  const router = useRouter();

  const clientsQuery = useMemoFirebase(
    () => getActiveClientsQuery(db),
    [db],
  );

  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        action={{ label: 'Novo Cliente', href: '/clientes/novo' }}
      />
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={clients || []}
            loading={isLoading}
            searchPlaceholder="Buscar por nome, CPF, email..."
            emptyMessage="Nenhum cliente cadastrado ainda."
            onRowClick={(c) => router.push(`/clientes/${c.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
