'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { getDoctorRef, updateDoctor, softDeleteDoctor } from '@/services/doctors.service';
import { DoctorForm } from '@/components/forms/doctor-form';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Doctor } from '@/types/doctor';
import type { DoctorFormValues } from '@/types';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

export default function MedicoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doctorRef = useMemoFirebase(() => getDoctorRef(db, id), [db, id]);
  const { data: doctor, isLoading } = useDoc<Doctor>(doctorRef);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold">Medico nao encontrado</p>
        <Button asChild variant="outline"><Link href="/medicos">Voltar</Link></Button>
      </div>
    );
  }

  // Map Firestore Doctor back to DoctorFormValues for the edit form
  const defaultValues: Partial<DoctorFormValues> = {
    document: doctor.document,
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    email: doctor.email,
    crm: doctor.crm,
    mainSpecialty: doctor.mainSpecialty,
    state: doctor.state,
    city: doctor.city,
    phone: doctor.phone,
    mobilePhone: doctor.mobilePhone,
  };

  const handleSave = async (data: DoctorFormValues) => {
    setSaving(true);
    try {
      await updateDoctor(db, id, {
        document: data.document,
        firstName: data.firstName,
        lastName: data.lastName || '',
        fullName: `${data.firstName} ${data.lastName || ''}`.trim(),
        email: data.email || '',
        crm: data.crm,
        mainSpecialty: data.mainSpecialty || '',
        state: data.state || '',
        city: data.city || '',
        phone: data.phone || '',
        mobilePhone: data.mobilePhone || '',
      });
      toast({ title: 'Medico atualizado com sucesso.' });
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar medico.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setDeleting(true);
    try {
      await softDeleteDoctor(db, id);
      toast({ title: 'Medico desativado.' });
      router.push('/medicos');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao desativar medico.', variant: 'destructive' });
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            ← Cancelar
          </Button>
          <PageHeader title={`Editar: ${doctor.fullName}`} />
        </div>
        <DoctorForm
          onSubmit={handleSave}
          defaultValues={defaultValues}
          isLoading={saving}
          submitLabel="Salvar Alteracoes"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={doctor.fullName} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Dados do Medico</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        </CardHeader>
        <CardContent>
          <InfoRow label="CPF" value={<span className="font-mono">{doctor.document}</span>} />
          <InfoRow label="CRM" value={doctor.crm} />
          <InfoRow label="Especialidade" value={doctor.mainSpecialty} />
          <InfoRow label="UF" value={doctor.state} />
          <InfoRow label="Município" value={doctor.city} />
          <InfoRow label="Telefone" value={doctor.phone} />
          <InfoRow label="Celular" value={doctor.mobilePhone} />
          <InfoRow label="Email" value={doctor.email} />
          <InfoRow
            label="Status"
            value={
              <Badge variant={doctor.active ? 'default' : 'destructive'}>
                {doctor.active ? 'Ativo' : 'Inativo'}
              </Badge>
            }
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" asChild>
          <Link href="/medicos">← Voltar</Link>
        </Button>
        {doctor.active && (
          <Button variant="destructive" onClick={handleDeactivate} disabled={deleting}>
            {deleting ? 'Desativando...' : 'Desativar Medico'}
          </Button>
        )}
      </div>
    </div>
  );
}
