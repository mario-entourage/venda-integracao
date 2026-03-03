'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { query, where, orderBy } from 'firebase/firestore';
import { useFirebase, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase';
import {
  getRepresentanteRef,
  updateRepresentante,
  softDeleteRepresentante,
} from '@/services/representantes.service';
import { getUsersRef } from '@/services/users.service';
import { PageHeader } from '@/components/shared/page-header';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Representante } from '@/types/representante';
import type { User } from '@/types';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

export default function RepresentanteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { isAdmin } = useFirebase();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
    userId: '',
  });

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

  const representanteRef = useMemoFirebase(
    () => getRepresentanteRef(db, id),
    [db, id],
  );
  const { data: representante, isLoading } = useDoc<Representante>(representanteRef);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!representante) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold">Representante não encontrado</p>
        <Button asChild variant="outline">
          <Link href="/representantes">Voltar</Link>
        </Button>
      </div>
    );
  }

  const handleStartEdit = () => {
    setForm({
      name: representante.name,
      code: representante.code,
      email: representante.email || '',
      phone: representante.phone || '',
      userId: representante.userId || '',
    });
    setEditing(true);
  };

  const handleChange = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: 'Nome e Código são obrigatórios.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateRepresentante(db, id, {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        userId: form.userId || '',
      });
      toast({ title: 'Representante atualizado com sucesso.' });
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar representante.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setDeleting(true);
    try {
      await softDeleteRepresentante(db, id);
      toast({ title: 'Representante desativado.' });
      router.push('/representantes');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao desativar representante.', variant: 'destructive' });
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
          <PageHeader title={`Editar: ${representante.name}`} />
        </div>

        <form onSubmit={handleSave}>
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
                    value={form.name}
                    onChange={handleChange('name')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Código *</Label>
                  <Input
                    id="code"
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
                    value={form.email}
                    onChange={handleChange('email')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={handleChange('phone')}
                  />
                </div>
              </div>

              {/* ── Vincular a Usuário (opcional) ── */}
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
                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar Alterações'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={representante.name} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Dados do Representante</CardTitle>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleStartEdit}>
              Editar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <InfoRow label="Código" value={representante.code} />
          <InfoRow label="Email" value={representante.email} />
          <InfoRow label="Telefone" value={representante.phone} />
          <InfoRow
            label="Usuário Vinculado"
            value={
              representante.userId
                ? (users ?? []).find((u) => u.id === representante.userId)?.email ?? representante.userId
                : null
            }
          />
          <InfoRow
            label="Status"
            value={
              <Badge variant={representante.active ? 'default' : 'destructive'}>
                {representante.active ? 'Ativo' : 'Inativo'}
              </Badge>
            }
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" asChild>
          <Link href="/representantes">← Voltar</Link>
        </Button>
        {isAdmin && representante.active && (
          <Button variant="destructive" onClick={handleDeactivate} disabled={deleting}>
            {deleting ? 'Desativando...' : 'Desativar Representante'}
          </Button>
        )}
      </div>
    </div>
  );
}
