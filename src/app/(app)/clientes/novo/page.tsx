'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirestore, useUser } from '@/firebase/provider';
import { createClient } from '@/services/clients.service';
import { CustomerForm } from '@/components/forms/customer-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { CustomerFormValues } from '@/types';

export default function NovoClientePage() {
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: CustomerFormValues) => {
    setIsLoading(true);
    try {
      await createClient(db, data, user!.uid);
      toast({ title: 'Cliente cadastrado com sucesso.' });
      router.push('/clientes');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao cadastrar cliente.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clientes">← Voltar</Link>
        </Button>
        <PageHeader title="Novo Cliente" />
      </div>
      <CustomerForm onSubmit={handleSubmit} isLoading={isLoading} submitLabel="Cadastrar Cliente" />
    </div>
  );
}
