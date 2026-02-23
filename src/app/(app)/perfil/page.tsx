'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/firebase/provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function PerfilPage() {
  const { user } = useUser();

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Perfil</h1>
      <Card>
        <CardHeader><CardTitle>Meus Dados</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.photoURL || undefined} />
            <AvatarFallback>{user?.displayName?.[0] || '?'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user?.displayName || 'Usuario'}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
