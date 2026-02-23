import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EstoquePage() {
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Estoque</h1>
      <Card>
        <CardHeader><CardTitle>Visao Geral do Estoque</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Dados de estoque em desenvolvimento.</p></CardContent>
      </Card>
    </div>
  );
}
