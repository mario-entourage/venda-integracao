import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export default function ClientesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-2xl font-bold">Clientes</h1>
        <Button asChild>
          <Link href="/clientes/novo"><Plus className="mr-2 h-4 w-4" />Novo Cliente</Link>
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Lista de Clientes</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Nenhum cliente cadastrado ainda.</p></CardContent>
      </Card>
    </div>
  );
}
