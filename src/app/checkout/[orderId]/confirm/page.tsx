import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function CheckoutConfirmPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-0">
          <CardTitle className="text-xl font-bold text-foreground">
            Pedido Confirmado
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 pb-8 px-8 space-y-3">
          <p className="text-sm text-muted-foreground">
            Pedido: <span className="font-mono">{orderId}</span>
          </p>

          <Button asChild className="w-full">
            <Link href="/checkout/success">Finalizar</Link>
          </Button>

          <Button asChild variant="outline" className="w-full">
            <Link href={`/checkout/${orderId}`}>Acompanhar Pedido</Link>
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href={`/controle/${orderId}`}>Abrir Controle</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

