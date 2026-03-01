'use client';

import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getUserRef, getUserProfilesRef } from '@/services/users.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { USER_GROUP_LABELS } from '@/lib/constants';
import { UserGroupType } from '@/types/enums';
import type { User, UserProfile } from '@/types';

export default function PerfilPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSex, setEditSex] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editState, setEditState] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDocumentNumber, setEditDocumentNumber] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('');

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

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';

  const handleEditStart = () => {
    setEditFullName(profile?.fullName || '');
    setEditEmail(profile?.email || '');
    setEditPhone(profile?.phone || '');
    setEditSex(profile?.sex || '');
    setEditBirthDate(
      profile?.birthDate
        ? profile.birthDate.toDate().toISOString().slice(0, 10)
        : '',
    );
    setEditState(profile?.state || '');
    setEditCity(profile?.city || '');
    setEditAddress(profile?.address || '');
    setEditDocumentNumber(profile?.documentNumber || '');
    setEditPostalCode(profile?.postalCode || '');
    setEditing(true);
  };

  const handleSave = async () => {
    if (!user?.uid || !profile?.id) return;
    setSaving(true);
    try {
      const profileRef = doc(db, 'users', user.uid, 'profiles', profile.id);
      await updateDoc(profileRef, {
        fullName: editFullName,
        email: editEmail,
        phone: editPhone,
        sex: editSex || null,
        birthDate: editBirthDate ? new Date(editBirthDate) : null,
        state: editState,
        city: editCity,
        address: editAddress,
        documentNumber: editDocumentNumber,
        postalCode: editPostalCode,
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
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meu Perfil" />

      {/* Identity card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user?.photoURL || undefined} />
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="text-xl font-semibold">
                {profile?.fullName || user?.displayName || 'Usuario'}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {userData?.groupId && (
                <Badge variant="secondary">
                  {USER_GROUP_LABELS[userData.groupId as UserGroupType] || userData.groupId}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable profile fields */}
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
            <div className="space-y-1.5">
              <Label>Email</Label>
              {editing ? (
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              ) : (
                <p className="text-sm">{profile?.email || user?.email || '—'}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              {editing ? (
                <Input
                  value={editSex}
                  onChange={(e) => setEditSex(e.target.value)}
                  placeholder="M / F"
                />
              ) : (
                <p className="text-sm">{profile?.sex || '—'}</p>
              )}
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              {editing ? (
                <Input
                  value={editState}
                  onChange={(e) => setEditState(e.target.value)}
                  placeholder="UF"
                  maxLength={2}
                />
              ) : (
                <p className="text-sm">{profile?.state || '—'}</p>
              )}
            </div>
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

          <div className="space-y-1.5">
            <Label>Endereco</Label>
            {editing ? (
              <Input
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
            ) : (
              <p className="text-sm">{profile?.address || '—'}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Documento de Identificacao</Label>
              {editing ? (
                <Input
                  value={editDocumentNumber}
                  onChange={(e) => setEditDocumentNumber(e.target.value)}
                />
              ) : (
                <p className="text-sm">{profile?.documentNumber || '—'}</p>
              )}
            </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
