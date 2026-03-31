'use client';

import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getUserRef, getUserProfilesRef, updateUser } from '@/services/users.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { BRAZILIAN_STATES } from '@/lib/constants';
import type { User, UserProfile, NotificationPreferences } from '@/types';

export default function PerfilPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editStreetName, setEditStreetName] = useState('');
  const [editStreetNumber, setEditStreetNumber] = useState('');
  const [editComplemento, setEditComplemento] = useState('');
  const [editBairro, setEditBairro] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');

  const userRef = useMemoFirebase(
    () => (user?.uid ? getUserRef(db, user.uid) : null),
    [db, user?.uid],
  );
  const profilesRef = useMemoFirebase(
    () => (user?.uid ? getUserProfilesRef(db, user.uid) : null),
    [db, user?.uid],
  );

  const { data: userData, isLoading: userDocLoading } = useDoc<User>(userRef);
  const { data: profiles, isLoading: profilesLoading } = useCollection<UserProfile>(profilesRef);

  const profile = profiles?.[0];
  const isLoading = isUserLoading || userDocLoading || profilesLoading;

  const handleEditStart = () => {
    setEditFullName(profile?.fullName || '');
    setEditPhone(profile?.phone || '');
    setEditCpf(profile?.cpf || '');
    setEditStreetName(profile?.streetName || '');
    setEditStreetNumber(profile?.streetNumber || '');
    setEditComplemento(profile?.complemento || '');
    setEditBairro(profile?.bairro || '');
    setEditCity(profile?.city || '');
    setEditState(profile?.state || '');
    setEditPostalCode(profile?.postalCode || '');
    setEditBirthDate(
      profile?.birthDate
        ? profile.birthDate.toDate().toISOString().slice(0, 10)
        : '',
    );
    setEditing(true);
  };

  const handleSave = async () => {
    if (!user?.uid || !profile?.id) return;
    setSaving(true);
    try {
      const profileRef = doc(db, 'users', user.uid, 'profiles', profile.id);
      await updateDoc(profileRef, {
        fullName: editFullName,
        phone: editPhone,
        cpf: editCpf,
        streetName: editStreetName,
        streetNumber: editStreetNumber,
        complemento: editComplemento || null,
        bairro: editBairro,
        city: editCity,
        state: editState,
        postalCode: editPostalCode,
        birthDate: editBirthDate ? new Date(editBirthDate) : null,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Perfil atualizado com sucesso.' });
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao atualizar perfil.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Meu Perfil" />
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meu Perfil" />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Dados do Perfil</CardTitle>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={handleEditStart}>
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email - uneditable */}
          <div className="space-y-1.5">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{user?.email || '—'}</p>
          </div>

          {/* Nome Completo */}
          <div className="space-y-1.5">
            <Label>Nome Completo</Label>
            {editing ? (
              <Input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            ) : (
              <p className="text-sm">{profile?.fullName || '—'}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Celular */}
            <div className="space-y-1.5">
              <Label>Celular</Label>
              {editing ? (
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              ) : (
                <p className="text-sm">{profile?.phone || '—'}</p>
              )}
            </div>

            {/* CPF */}
            <div className="space-y-1.5">
              <Label>CPF</Label>
              {editing ? (
                <Input
                  value={editCpf}
                  onChange={(e) => setEditCpf(e.target.value)}
                  placeholder="000.000.000-00"
                />
              ) : (
                <p className="text-sm">{profile?.cpf || '—'}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Nome da Rua */}
            <div className="space-y-1.5">
              <Label>Nome da Rua</Label>
              {editing ? (
                <Input
                  value={editStreetName}
                  onChange={(e) => setEditStreetName(e.target.value)}
                />
              ) : (
                <p className="text-sm">{profile?.streetName || '—'}</p>
              )}
            </div>

            {/* Numero */}
            <div className="space-y-1.5">
              <Label>Numero</Label>
              {editing ? (
                <Input
                  value={editStreetNumber}
                  onChange={(e) => setEditStreetNumber(e.target.value)}
                />
              ) : (
                <p className="text-sm">{profile?.streetNumber || '—'}</p>
              )}
            </div>
          </div>

          {/* Complemento */}
          <div className="space-y-1.5">
            <Label>Complemento <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            {editing ? (
              <Input
                value={editComplemento}
                onChange={(e) => setEditComplemento(e.target.value)}
                placeholder="Apto, Bloco, etc."
              />
            ) : (
              <p className="text-sm">{profile?.complemento || '—'}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Bairro */}
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              {editing ? (
                <Input
                  value={editBairro}
                  onChange={(e) => setEditBairro(e.target.value)}
                />
              ) : (
                <p className="text-sm">{profile?.bairro || '—'}</p>
              )}
            </div>

            {/* Cidade */}
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              {editing ? (
                <Input
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                />
              ) : (
                <p className="text-sm">{profile?.city || '—'}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Estado */}
            <div className="space-y-1.5">
              <Label>Estado</Label>
              {editing ? (
                <Select value={editState} onValueChange={setEditState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZILIAN_STATES.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{profile?.state || '—'}</p>
              )}
            </div>

            {/* CEP */}
            <div className="space-y-1.5">
              <Label>CEP</Label>
              {editing ? (
                <Input
                  value={editPostalCode}
                  onChange={(e) => setEditPostalCode(e.target.value)}
                  placeholder="00000-000"
                />
              ) : (
                <p className="text-sm">{profile?.postalCode || '—'}</p>
              )}
            </div>
          </div>

          {/* Data de Nascimento */}
          <div className="space-y-1.5">
            <Label>Data de Nascimento</Label>
            {editing ? (
              <Input
                type="date"
                value={editBirthDate}
                onChange={(e) => setEditBirthDate(e.target.value)}
              />
            ) : (
              <p className="text-sm">
                {profile?.birthDate
                  ? profile.birthDate.toDate().toLocaleDateString('pt-BR')
                  : '—'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification preferences — only shown for reps */}
      {userData?.isRepresentante && (
        <NotificationPreferencesCard
          db={db}
          userId={user?.uid ?? ''}
          prefs={userData?.notificationPreferences}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Preferences Card (for reps)
// ---------------------------------------------------------------------------

const DEFAULT_PREFS: NotificationPreferences = {
  emailOnOrderCreated: false,
  emailOnPaymentLinkCreated: true,
  emailOnPaymentReceived: true,
  inAppOnPaymentLinkCreated: true,
  inAppOnPaymentReceived: true,
};

function NotificationPreferencesCard({
  db,
  userId,
  prefs,
}: {
  db: ReturnType<typeof useFirestore>;
  userId: string;
  prefs?: NotificationPreferences;
}) {
  const { toast } = useToast();
  const current = prefs ?? DEFAULT_PREFS;

  const toggle = async (key: keyof NotificationPreferences) => {
    if (!userId) return;
    try {
      await updateUser(db, userId, {
        notificationPreferences: { ...current, [key]: !current[key] },
      });
    } catch {
      toast({ title: 'Erro ao salvar preferência.', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências de Notificação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Nova venda registrada (email)</p>
            <p className="text-xs text-muted-foreground">Receber email quando uma nova venda for criada</p>
          </div>
          <Switch
            checked={current.emailOnOrderCreated}
            onCheckedChange={() => toggle('emailOnOrderCreated')}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Link de pagamento criado (in-app)</p>
            <p className="text-xs text-muted-foreground">Receber notificação no sistema</p>
          </div>
          <Switch
            checked={current.inAppOnPaymentLinkCreated}
            onCheckedChange={() => toggle('inAppOnPaymentLinkCreated')}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Link de pagamento criado (email)</p>
            <p className="text-xs text-muted-foreground">Receber notificação por email</p>
          </div>
          <Switch
            checked={current.emailOnPaymentLinkCreated}
            onCheckedChange={() => toggle('emailOnPaymentLinkCreated')}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Pagamento recebido (in-app)</p>
            <p className="text-xs text-muted-foreground">Receber notificação no sistema</p>
          </div>
          <Switch
            checked={current.inAppOnPaymentReceived}
            onCheckedChange={() => toggle('inAppOnPaymentReceived')}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Pagamento recebido (email)</p>
            <p className="text-xs text-muted-foreground">Receber notificação por email</p>
          </div>
          <Switch
            checked={current.emailOnPaymentReceived}
            onCheckedChange={() => toggle('emailOnPaymentReceived')}
          />
        </div>
      </CardContent>
    </Card>
  );
}
