import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Checkout</h1>
      <Card>
        <CardHeader><CardTitle>Finalizar Pedido</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Pedido: {orderId}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/checkout/${orderId}/confirm`}>Confirmar</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/checkout/success">Ver Sucesso</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
