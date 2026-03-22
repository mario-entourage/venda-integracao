'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
  getUserRef,
  getUserProfilesRef,
  softDeleteUser,
  updateUser,
} from '@/services/users.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { USER_GROUP_LABELS } from '@/lib/constants';
import { UserGroupType } from '@/types/enums';
import type { User, UserProfile } from '@/types';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function UsuarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isAdminLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const userRef = useMemoFirebase(() => getUserRef(db, id), [db, id]);
  const profilesRef = useMemoFirebase(() => getUserProfilesRef(db, id), [db, id]);

  const { data: userData, isLoading } = useDoc<User>(userRef);
  const { data: profiles } = useCollection<UserProfile>(profilesRef);

  const profile = profiles?.[0];

  if (isAdminLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
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

  if (!userData) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold">Usuario nao encontrado</p>
        <Button asChild variant="outline">
          <Link href="/usuarios">Voltar</Link>
        </Button>
      </div>
    );
  }

  const handleDeactivate = async () => {
    setDeleting(true);
    try {
      await softDeleteUser(db, id, user!.uid);
      toast({ title: 'Usuario desativado com sucesso.' });
      router.push('/usuarios');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao desativar usuario.', variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={profile?.fullName || userData.email} />

      {/* User core data */}
      <Card>
        <CardHeader>
          <CardTitle>Dados do Usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Email" value={userData.email} />
          <InfoRow
            label="Grupo"
            value={USER_GROUP_LABELS[userData.groupId as UserGroupType] || userData.groupId}
          />
          <InfoRow
            label="Status"
            value={
              <Badge variant={userData.active ? 'default' : 'destructive'}>
                {userData.active ? 'Ativo' : 'Inativo'}
              </Badge>
            }
          />
          <InfoRow
            label="Representante"
            value={
              <Switch
                checked={!!userData.isRepresentante}
                onCheckedChange={async (val) => {
                  try {
                    await updateUser(db, id, { isRepresentante: val }, user!.uid);
                    toast({ title: val ? 'Marcado como representante.' : 'Representante removido.' });
                  } catch {
                    toast({ title: 'Erro ao atualizar.', variant: 'destructive' });
                  }
                }}
              />
            }
          />
        </CardContent>
      </Card>

      {/* Profile */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="Nome Completo" value={profile.fullName} />
            <InfoRow label="Email" value={profile.email || '—'} />
            <InfoRow label="Telefone" value={profile.phone || '—'} />
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" asChild>
          <Link href="/usuarios">← Voltar</Link>
        </Button>
        {userData.active && (
          <Button variant="destructive" onClick={handleDeactivate} disabled={deleting}>
            {deleting ? 'Desativando...' : 'Desativar Usuario'}
          </Button>
        )}
      </div>
    </div>
  );
}
