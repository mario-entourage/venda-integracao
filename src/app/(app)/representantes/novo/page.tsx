'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirestore } from '@/firebase/provider';
import { createRepresentante } from '@/services/representantes.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function NovoRepresentantePage() {
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
  });

  const handleChange = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: 'Nome e Código são obrigatórios.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      await createRepresentante(db, {
        name: form.name.trim(),
        code: form.code.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
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
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  placeholder="Ex: REP001"
                  value={form.code}
                  onChange={handleChange('code')}
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
