'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase/provider';
import { createUser } from '@/services/users.service';
import { UserForm } from '@/components/forms/user-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import type { UserCreationFormValues } from '@/types';

export default function NovoUsuarioPage() {
  const { isAdmin, isAdminLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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

  const handleSubmit = async (data: UserCreationFormValues) => {
    setIsLoading(true);
    try {
      await createUser(db, { ...data, groupId: data.groupId });
      toast({ title: 'Usuario criado com sucesso.' });
      router.push('/usuarios');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao criar usuario.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/usuarios">← Voltar</Link>
        </Button>
        <PageHeader title="Novo Usuario" />
      </div>
      <UserForm onSubmit={handleSubmit} isLoading={isLoading} />
    </div>
  );
}
