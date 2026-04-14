'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getActiveClientsQuery } from '@/services/clients.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MergeClientsDialog } from '@/components/clientes/merge-clients-dialog';
import { GitMerge } from 'lucide-react';
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
  const { isAdmin } = useUser();
  const [mergeOpen, setMergeOpen] = useState(false);

  const clientsQuery = useMemoFirebase(
    () => getActiveClientsQuery(db),
    [db],
  );

  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Clientes"
          action={{ label: 'Novo Cliente', href: '/clientes/novo' }}
        />
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
            <GitMerge className="h-4 w-4 mr-2" />
            Mesclar duplicados
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={clients || []}
            loading={isLoading}
            searchPlaceholder="Buscar por nome, CPF, email..."
            emptyMessage="Nenhum cliente cadastrado ainda."
            exportFilename="clientes"
            onRowClick={(c) => router.push(`/clientes/${c.id}`)}
          />
        </CardContent>
      </Card>

      {isAdmin && (
        <MergeClientsDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          clients={(clients || []) as (Client & { id: string })[]}
          onMerged={() => router.refresh()}
        />
      )}
    </div>
  );
}
