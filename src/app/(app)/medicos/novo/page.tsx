'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirestore, useUser } from '@/firebase/provider';
import { createDoctor } from '@/services/doctors.service';
import { DoctorForm } from '@/components/forms/doctor-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { DoctorFormValues } from '@/types';

export default function NovoMedicoPage() {
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: DoctorFormValues) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await createDoctor(db, data, user!.uid);
      toast({ title: 'Medico cadastrado com sucesso.' });
      router.push('/medicos');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao cadastrar medico.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/medicos">← Voltar</Link>
        </Button>
        <PageHeader title="Novo Medico" />
      </div>
      <DoctorForm onSubmit={handleSubmit} isLoading={isLoading} submitLabel="Cadastrar Medico" />
    </div>
  );
}
