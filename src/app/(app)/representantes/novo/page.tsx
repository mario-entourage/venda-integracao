'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { query, orderBy, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import { createRepresentante } from '@/services/representantes.service';
import { getUsersRef } from '@/services/users.service';
import { PageHeader } from '@/components/shared/page-header';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types';

export default function NovoRepresentantePage() {
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // ── Fetch active users for optional linking ──
  const usersQ = useMemoFirebase(
    () => db ? query(getUsersRef(db), where('active', '==', true), orderBy('email', 'asc')) : null,
    [db],
  );
  const { data: users } = useCollection<User>(usersQ);

  const userOptions = (users ?? []).map((u) => ({
    value: u.id,
    label: u.email,
    sublabel: u.groupId === 'admin' ? 'Admin' : undefined,
  }));

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    estado: '',
    userId: '',
  });

  const handleChange = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: 'Nome é obrigatório.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      await createRepresentante(db, {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        estado: form.estado.trim() || undefined,
        userId: form.userId || undefined,
      });
      toast({ title: 'Representante cadastrado com sucesso.' });
      router.push('/representantes');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao cadastrar representante.', variant: 'destructive' });
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

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Dados do Representante</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Nome completo"
                  value={form.name}
                  onChange={handleChange('name')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={handleChange('email')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-9999"
                  value={form.phone}
                  onChange={handleChange('phone')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Input
                  id="estado"
                  placeholder="Ex: SP"
                  value={form.estado}
                  onChange={handleChange('estado')}
                />
              </div>
            </div>

            {/* ── Vincular a um Usuário (opcional) ── */}
            <div className="space-y-2">
              <Label>Vincular a um Usuário (opcional)</Label>
              <SearchableSelect
                options={userOptions}
                value={form.userId}
                onChange={(v) => setForm((prev) => ({ ...prev, userId: v }))}
                placeholder="Nenhum — sem vínculo"
                searchPlaceholder="Buscar por email…"
                emptyMessage="Nenhum usuário encontrado"
              />
              {form.userId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setForm((prev) => ({ ...prev, userId: '' }))}
                >
                  Remover vínculo
                </Button>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Cadastrando…' : 'Cadastrar Representante'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
