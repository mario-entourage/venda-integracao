import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Pedido</h1>
      <Card>
        <CardHeader><CardTitle>Detalhes do Pedido</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">ID: {orderId}</p></CardContent>
      </Card>
    </div>
  );
}
