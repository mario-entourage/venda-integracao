/**
 * /order-flow/payment/[paymentId]
 *
 * Displays a payment record fetched from the in-memory store.
 * Pure Server Component — no interactivity needed at this stage.
 *
 * REPLACE LATER:
 *   getPaymentById → stripe.paymentIntents.retrieve(paymentId)
 *                 or getDoc(doc(db, "payments", paymentId))
 *   Embed a Stripe Elements form here to collect card details.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { getPaymentById } from "@/order-flow/infrastructure/paymentStore";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );

interface Props {
  params: Promise<{ paymentId: string }>;
}

export default async function PaymentPage({ params }: Props) {
  const { paymentId } = await params;
  const payment = getPaymentById(paymentId);

  if (!payment) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted/30 p-6 md:items-center">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Payment</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Status banner */}
          <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
            <Clock className="h-4 w-4 shrink-0 text-yellow-600" />
            <p className="text-sm font-medium text-yellow-700">
              Awaiting payment confirmation
            </p>
          </div>

          {/* Details grid */}
          <dl className="divide-y rounded-lg border text-sm">
            <Row label="Payment ID">
              <span className="font-mono font-semibold">{payment.id}</span>
            </Row>
            <Row label="Order ID">
              <Link
                href={`/order-flow/order-confirmation/${payment.orderId}`}
                className="font-mono text-primary underline-offset-4 hover:underline"
              >
                {payment.orderId}
              </Link>
            </Row>
            <Row label="Amount">
              <span className="text-base font-bold">{fmt(payment.amount)}</span>
            </Row>
            <Row label="Status">
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700 capitalize">
                {payment.status}
              </span>
            </Row>
            <Row label="Created at">
              {payment.createdAt.toLocaleString("pt-BR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </Row>
          </dl>
        </CardContent>

        <CardFooter className="flex justify-between border-t pt-5">
          <Button variant="outline" asChild>
            <Link href={`/order-flow/order-confirmation/${payment.orderId}`}>
              ← Back to Order
            </Link>
          </Button>

          {/* REPLACE LATER: swap this placeholder with a real payment form or
              a redirect to a Stripe-hosted checkout session URL. */}
          <Button disabled>
            Pay Now (coming soon)
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
