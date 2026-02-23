import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function MedicoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Medico</h1>
      <Card>
        <CardHeader><CardTitle>Detalhes do Medico</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">ID: {id}</p></CardContent>
      </Card>
    </div>
  );
}
