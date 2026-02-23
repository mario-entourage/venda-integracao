import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ControlePage() {
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Controle de Pedidos</h1>
      <Card>
        <CardHeader><CardTitle>Lista de Pedidos</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Nenhum pedido encontrado.</p></CardContent>
      </Card>
    </div>
  );
}
