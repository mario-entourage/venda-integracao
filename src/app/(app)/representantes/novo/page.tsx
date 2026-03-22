'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { query, orderBy, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { getUsersRef, updateUser, createPreregistration } from '@/services/users.service';
import { PageHeader } from '@/components/shared/page-header';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types';

export default function NovoRepresentantePage() {
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Fetch active users who are NOT already reps
  const usersQ = useMemoFirebase(
    () => db ? query(getUsersRef(db), where('active', '==', true), orderBy('email', 'asc')) : null,
    [db],
  );
  const { data: users } = useCollection<User>(usersQ);

  const nonRepUsers = (users ?? []).filter((u) => !u.isRepresentante);
  const userOptions = nonRepUsers.map((u) => ({
    value: u.id,
    label: u.displayName || u.email,
    sublabel: u.email,
  }));

  const [selectedUserId, setSelectedUserId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');

  const handlePromoteExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      toast({ title: 'Selecione um usuário.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      await updateUser(db, selectedUserId, { isRepresentante: true }, user!.uid);
      toast({ title: 'Usuário promovido a representante.' });
      router.push('/representantes');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar usuário.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreregister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast({ title: 'Email é obrigatório.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      await createPreregistration(db, newEmail.trim(), 'user', user!.uid, {
        isRepresentante: true,
        displayName: newDisplayName.trim() || undefined,
      });
      toast({ title: 'Pré-registro criado. O usuário será representante ao fazer login.' });
      router.push('/representantes');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao criar pré-registro.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/representantes">← Voltar</Link>
        </Button>
        <PageHeader title="Novo Representante" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar Representante</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="existing">
            <TabsList className="mb-4">
              <TabsTrigger value="existing">Usuário existente</TabsTrigger>
              <TabsTrigger value="new">Pré-registrar novo</TabsTrigger>
            </TabsList>

            <TabsContent value="existing">
              <form onSubmit={handlePromoteExisting} className="space-y-4">
                <div className="space-y-2">
                  <Label>Selecione um usuário para marcar como representante</Label>
                  <SearchableSelect
                    options={userOptions}
                    value={selectedUserId}
                    onChange={setSelectedUserId}
                    placeholder="Buscar usuário…"
                    searchPlaceholder="Nome ou email…"
                    emptyMessage="Nenhum usuário disponível"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isLoading || !selectedUserId}>
                    {isLoading ? 'Salvando…' : 'Promover a Representante'}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="new">
              <form onSubmit={handlePreregister} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  O usuário será marcado como representante automaticamente ao fazer login com este email.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="newEmail">Email *</Label>
                    <Input
                      id="newEmail"
                      type="email"
                      placeholder="rep@entouragelab.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newDisplayName">Nome</Label>
                    <Input
                      id="newDisplayName"
                      placeholder="Nome completo"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isLoading || !newEmail.trim()}>
                    {isLoading ? 'Salvando…' : 'Pré-registrar Representante'}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
