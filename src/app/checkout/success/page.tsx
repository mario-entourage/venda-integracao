import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function CheckoutSuccessPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-10 pb-8 px-8 space-y-4">
          {/* checkmark icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground">Pedido Confirmado</h1>
            <p className="text-sm text-muted-foreground">
              Seu pedido foi recebido e está sendo processado pela nossa equipe.
            </p>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-4">
            Em breve você receberá mais informações sobre o andamento do seu pedido.
          </p>

          <Button asChild variant="outline" className="w-full mt-2">
            <Link href="/">Voltar ao início</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
