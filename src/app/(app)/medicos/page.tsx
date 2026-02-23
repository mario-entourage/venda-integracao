import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export default function MedicosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-2xl font-bold">Medicos</h1>
        <Button asChild>
          <Link href="/medicos/novo"><Plus className="mr-2 h-4 w-4" />Novo Medico</Link>
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Lista de Medicos</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Nenhum medico cadastrado ainda.</p></CardContent>
      </Card>
    </div>
  );
}
