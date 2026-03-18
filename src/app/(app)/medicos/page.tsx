'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getActiveDoctorsQuery } from '@/services/doctors.service';
import { getActiveRepUsersQuery } from '@/services/users.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { ColumnDef } from '@/components/shared/data-table';
import type { Doctor } from '@/types/doctor';
import type { User } from '@/types';

export default function MedicosPage() {
  const db = useFirestore();
  const router = useRouter();

  const doctorsQuery = useMemoFirebase(
    () => getActiveDoctorsQuery(db),
    [db],
  );
  const repUsersQ = useMemoFirebase(() => getActiveRepUsersQuery(db), [db]);

  const { data: doctors, isLoading } = useCollection<Doctor>(doctorsQuery);
  const { data: repUsers } = useCollection<User>(repUsersQ);

  const repMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of repUsers ?? []) {
      m.set(r.id, r.displayName || r.email || r.id);
    }
    return m;
  }, [repUsers]);

  const columns: ColumnDef<Doctor>[] = [
    {
      key: 'fullName',
      header: 'Nome',
      sortable: true,
    },
    {
      key: 'crm',
      header: 'CRM',
      sortable: true,
    },
    {
      key: 'mainSpecialty',
      header: 'Especialidade',
      render: (item) => item.mainSpecialty || '—',
    },
    {
      key: 'repUserId',
      header: 'Representante',
      render: (item) => (item.repUserId ? repMap.get(item.repUserId) ?? '—' : '—'),
    },
    {
      key: 'email',
      header: 'Email',
      render: (item) => item.email || '—',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medicos"
        action={{ label: 'Novo Medico', href: '/medicos/novo' }}
      />
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={doctors || []}
            loading={isLoading}
            searchPlaceholder="Buscar por nome, CRM, especialidade..."
            emptyMessage="Nenhum medico cadastrado ainda."
            exportFilename="medicos"
            onRowClick={(d) => router.push(`/medicos/${d.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
