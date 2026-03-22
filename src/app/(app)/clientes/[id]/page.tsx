'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { getClientRef, updateClient, softDeleteClient } from '@/services/clients.service';
import { CustomerForm } from '@/components/forms/customer-form';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/types/client';
import type { CustomerFormValues } from '@/types';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const clientRef = useMemoFirebase(() => getClientRef(db, id), [db, id]);
  const { data: client, isLoading } = useDoc<Client>(clientRef);

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

  if (!client) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold">Cliente nao encontrado</p>
        <Button asChild variant="outline"><Link href="/clientes">Voltar</Link></Button>
      </div>
    );
  }

  // Map Firestore Client back to CustomerFormValues for the edit form
  const defaultValues: Partial<CustomerFormValues> = {
    document: client.document,
    rg: client.rg,
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    phone: client.phone,
    birthDate: client.birthDate?.toDate(),
    address: client.address ?? undefined,
  };

  const handleSave = async (data: CustomerFormValues) => {
    setSaving(true);
    try {
      await updateClient(db, id, {
        document: data.document,
        rg: data.rg || '',
        firstName: data.firstName,
        lastName: data.lastName || '',
        fullName: `${data.firstName} ${data.lastName || ''}`.trim(),
        email: data.email || '',
        phone: data.phone || '',
        birthDate: data.birthDate ? Timestamp.fromDate(data.birthDate) : undefined,
        address: data.address ?? undefined,
      }, user?.uid);
      toast({ title: 'Cliente atualizado com sucesso.' });
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar cliente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setDeleting(true);
    try {
      await softDeleteClient(db, id, user?.uid);
      toast({ title: 'Cliente desativado.' });
      router.push('/clientes');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao desativar cliente.', variant: 'destructive' });
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
          <PageHeader title={`Editar: ${client.fullName}`} />
        </div>
        <CustomerForm
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
      <PageHeader title={client.fullName} />

      {/* Core data */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Dados do Cliente</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        </CardHeader>
        <CardContent>
          <InfoRow label="CPF" value={<span className="font-mono">{client.document}</span>} />
          <InfoRow label="RG" value={client.rg} />
          <InfoRow
            label="Data de Nascimento"
            value={
              client.birthDate
                ? new Intl.DateTimeFormat('pt-BR').format(client.birthDate.toDate())
                : undefined
            }
          />
          <InfoRow label="E-mail" value={client.email} />
          <InfoRow label="Celular" value={client.phone} />
          <InfoRow
            label="Status"
            value={
              <Badge variant={client.active ? 'default' : 'destructive'}>
                {client.active ? 'Ativo' : 'Inativo'}
              </Badge>
            }
          />
        </CardContent>
      </Card>

      {/* Address */}
      {client.address && (
        <Card>
          <CardHeader><CardTitle>Endereco</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">
              {client.address.street}, {client.address.number}
              {client.address.complement ? ` — ${client.address.complement}` : ''}
              <br />
              {client.address.neighborhood} · {client.address.city} / {client.address.state}
              <br />
              <span className="font-mono text-muted-foreground">CEP {client.address.postalCode}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" asChild>
          <Link href="/clientes">← Voltar</Link>
        </Button>
        {client.active && (
          <Button variant="destructive" onClick={handleDeactivate} disabled={deleting}>
            {deleting ? 'Desativando...' : 'Desativar Cliente'}
          </Button>
        )}
      </div>
    </div>
  );
}
