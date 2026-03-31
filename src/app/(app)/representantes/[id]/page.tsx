'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirebase, useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { getUserRef, updateUser } from '@/services/users.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types/user';

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
  const { user: currentUser } = useUser();

  const [removing, setRemoving] = useState(false);

  const userRef = useMemoFirebase(
    () => getUserRef(db, id),
    [db, id],
  );
  const { data: user, isLoading } = useDoc<User>(userRef);

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

  if (!user) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold">Representante não encontrado</p>
        <Button asChild variant="outline">
          <Link href="/representantes">Voltar</Link>
        </Button>
      </div>
    );
  }

  const handleRemoveRep = async () => {
    setRemoving(true);
    try {
      await updateUser(db, id, { isRepresentante: false }, currentUser!.uid);
      toast({ title: 'Representante removido.' });
      router.push('/representantes');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao remover representante.', variant: 'destructive' });
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={user.displayName || user.email} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Dados do Representante</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Nome" value={user.displayName} />
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="Grupo" value={user.groupId === 'admin' ? 'Admin' : user.groupId === 'view_only' ? 'Somente Leitura' : 'Usuário'} />
          <InfoRow
            label="Representante"
            value={
              <Badge variant={user.isRepresentante ? 'default' : 'secondary'}>
                {user.isRepresentante ? 'Sim' : 'Não'}
              </Badge>
            }
          />
          <InfoRow
            label="Status"
            value={
              <Badge variant={user.active ? 'default' : 'destructive'}>
                {user.active ? 'Ativo' : 'Inativo'}
              </Badge>
            }
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" asChild>
          <Link href="/representantes">← Voltar</Link>
        </Button>
        {isAdmin && user.isRepresentante && (
          <Button variant="destructive" onClick={handleRemoveRep} disabled={removing}>
            {removing ? 'Removendo…' : 'Remover como Representante'}
          </Button>
        )}
      </div>
    </div>
  );
}
