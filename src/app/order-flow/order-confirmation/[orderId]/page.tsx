/**
 * /order-flow/order-confirmation/[orderId]
 *
 * Displays a real order fetched from the in-memory store.
 * The "Generate Payment Link" button is a form submit that triggers a Server
 * Action — no client-side JS required for the interaction.
 *
 * REPLACE LATER:
 *   getOrderById → getDoc(doc(db, "orders", orderId))
 *   generatePaymentLink Server Action → Stripe payment intent creation
 */

import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getOrderById } from "@/order-flow/infrastructure/orderStore";
import { generatePaymentLink } from "@/order-flow/application/generatePaymentLink";
import { OrderSummary } from "@/order-flow/components/OrderSummary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function OrderConfirmationPage({ params }: Props) {
  const { orderId } = await params;
  const order = getOrderById(orderId);

  if (!order) {
    notFound();
  }

  // Inline server action — closes over `orderId` from the route params.
  async function handleGeneratePaymentLink() {
    "use server";
    await generatePaymentLink(orderId);
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted/30 p-6 md:items-center">
      <Card className="w-full max-w-2xl shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Order Confirmation</CardTitle>
        </CardHeader>

        <CardContent>
          <OrderSummary order={order} />
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-3 border-t pt-6 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Review your order before proceeding to payment.
          </p>

          {order.status === "Created" ? (
            <form action={handleGeneratePaymentLink}>
              <Button type="submit" className="w-full sm:w-auto">
                Generate Payment Link
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          ) : (
            <span className="text-sm font-medium text-yellow-600">
              Payment link already generated — status: {order.status}
            </span>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
