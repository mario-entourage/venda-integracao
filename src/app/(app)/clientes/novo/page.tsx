import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NovoClientePage() {
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Novo Cliente</h1>
      <Card>
        <CardHeader><CardTitle>Dados do Cliente</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Formulario de cadastro em desenvolvimento.</p></CardContent>
      </Card>
    </div>
  );
}
