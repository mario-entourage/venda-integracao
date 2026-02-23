import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NovoUsuarioPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Novo Usuario</h1>
      <Card>
        <CardHeader><CardTitle>Dados do Usuario</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Formulario de criacao em desenvolvimento.</p></CardContent>
      </Card>
    </div>
  );
}
