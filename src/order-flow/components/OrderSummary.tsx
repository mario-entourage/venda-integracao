import type { Order } from "../domain/order";

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );

const STATUS_COLOR: Record<Order["status"], string> = {
  Created: "bg-slate-100 text-slate-700",
  "Pending Payment": "bg-yellow-100 text-yellow-700",
  Paid: "bg-green-100 text-green-700",
};

interface Props {
  order: Order;
}

export function OrderSummary({ order }: Props) {
  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Order ID
          </p>
          <p className="font-mono text-lg font-semibold">{order.id}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[order.status]}`}
        >
          {order.status}
        </span>
      </div>

      {/* Customer */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Customer
        </p>
        <p className="mt-0.5 text-sm">{order.customer}</p>
      </div>

      {/* Products table */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Products
        </p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Product</th>
                <th className="px-4 py-2 text-center font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Unit</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.products.map((p, i) => (
                <tr key={i} className="bg-background">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2 text-center">{p.quantity}</td>
                  <td className="px-4 py-2 text-right">{fmt(p.price)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {fmt(p.price * p.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-2 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground"
                >
                  Total
                </td>
                <td className="px-4 py-2 text-right text-base font-bold">
                  {fmt(order.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Created at */}
      <p className="text-xs text-muted-foreground">
        Created at{" "}
        {order.createdAt.toLocaleString("pt-BR", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>
    </div>
  );
}
