import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export default function UsuariosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-2xl font-bold">Usuarios</h1>
        <Button asChild>
          <Link href="/usuarios/novo"><Plus className="mr-2 h-4 w-4" />Novo Usuario</Link>
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Gestao de Usuarios</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Nenhum usuario encontrado.</p></CardContent>
      </Card>
    </div>
  );
}
