import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function RemessasPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Remessas</h1>
      <Card>
        <CardHeader><CardTitle>Lista de Remessas</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Nenhuma remessa encontrada.</p></CardContent>
      </Card>
    </div>
  );
}
