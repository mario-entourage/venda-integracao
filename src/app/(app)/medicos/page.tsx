'use client';

import { useRouter } from 'next/navigation';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getActiveDoctorsQuery } from '@/services/doctors.service';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { ColumnDef } from '@/components/shared/data-table';
import type { Doctor } from '@/types/doctor';

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
    key: 'email',
    header: 'Email',
    render: (item) => item.email || '—',
  },
];

export default function MedicosPage() {
  const db = useFirestore();
  const router = useRouter();

  const doctorsQuery = useMemoFirebase(
    () => getActiveDoctorsQuery(db),
    [db],
  );

  const { data: doctors, isLoading } = useCollection<Doctor>(doctorsQuery);

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
            onRowClick={(d) => router.push(`/medicos/${d.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
