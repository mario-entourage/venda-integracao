/**
 * /order-flow  — demo entry point.
 *
 * Creates a sample order and immediately redirects to its confirmation page.
 * Remove this page (and the whole /order-flow folder) once real order creation
 * is wired from your actual checkout flow.
 */

import { redirect } from "next/navigation";
import { createOrder } from "@/order-flow/application/createOrder";
import { Button } from "@/components/ui/button";

// Inline server action — runs on the server when the form is submitted.
async function startDemo() {
  "use server";

  const order = createOrder({
    customer: "Demo Customer",
    products: [
      { name: "Produto A — Suplemento", quantity: 2, price: 4990 },
      { name: "Produto B — Vitamina D3", quantity: 1, price: 9900 },
    ],
  });

  redirect(`/order-flow/order-confirmation/${order.id}`);
}

export default function OrderFlowEntryPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Order Flow Demo</h1>
        <p className="text-sm text-muted-foreground">
          Creates a sample order and walks through the full confirmation →
          payment lifecycle.
        </p>
        <form action={startDemo}>
          <Button type="submit" className="w-full">
            Start Demo →
          </Button>
        </form>
      </div>
    </main>
  );
}
