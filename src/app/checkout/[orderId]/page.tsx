import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Checkout</h1>
      <Card>
        <CardHeader><CardTitle>Finalizar Pedido</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Pedido: {orderId}</p></CardContent>
      </Card>
    </div>
  );
}
