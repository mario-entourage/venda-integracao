/**
 * Dev-only test page: /dev/test-order-flow
 *
 * Runs the entire mock order lifecycle automatically on load and displays
 * a full audit trail as JSON. Remove this page (and /mocks) when integrating
 * real services.
 *
 * Flow:
 *   1. Create admin
 *   2. Create product
 *   3. Create order
 *   4. Simulate payment
 *   5. Generate tracking + mark shipped
 *   6. Mark completed
 */

"use client";

import { useEffect, useState } from "react";

// Services — swap these imports for real service modules when going live.
import { createAdmin, createProduct } from "../../../mocks/services/adminService";
import { createOrder, markOrderCompleted } from "../../../mocks/services/orderService";
import { simulatePayment } from "../../../mocks/services/paymentService";
import { shipOrder } from "../../../mocks/services/shippingService";

interface FlowStep {
  step: string;
  result: unknown;
}

export default function TestOrderFlowPage() {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const log: FlowStep[] = [];

    try {
      // Step 1 — Create admin
      const admin = createAdmin("dev-admin@entouragelab.com");
      log.push({ step: "1. Create Admin", result: admin });

      // Step 2 — Admin creates product (price in cents: 4990 = R$49,90)
      const product = createProduct("Produto Teste", 4990, 100);
      log.push({ step: "2. Create Product", result: product });

      // Step 3 — Create order (2 units)
      const order = createOrder(product.id, 2);
      log.push({ step: "3. Create Order", result: order });

      // Step 4 — Simulate payment
      const paidOrder = simulatePayment(order.id);
      log.push({ step: "4. Simulate Payment", result: paidOrder });

      // Step 5 — Ship order (generates tracking number)
      const shippedOrder = shipOrder(order.id);
      log.push({ step: "5. Ship Order", result: shippedOrder });

      // Step 6 — Mark completed
      const completedOrder = markOrderCompleted(order.id);
      log.push({ step: "6. Mark Completed", result: completedOrder });

      setSteps(log);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSteps(log);
    }
  }, []);

  return (
    <main
      style={{
        fontFamily: "monospace",
        padding: "2rem",
        maxWidth: "860px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>
        Mock Order Flow — Dev Test
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem", fontSize: "0.85rem" }}>
        This page runs automatically. Remove it before production.
      </p>

      {error && (
        <div
          style={{
            background: "#fff0f0",
            border: "1px solid #f88",
            borderRadius: "6px",
            padding: "1rem",
            marginBottom: "1.5rem",
            color: "#c00",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {steps.map((s, i) => (
        <section
          key={i}
          style={{
            marginBottom: "1.5rem",
            background: "#f8f8f8",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
            border: "1px solid #e0e0e0",
          }}
        >
          <h2
            style={{
              fontSize: "0.95rem",
              fontWeight: "bold",
              marginBottom: "0.5rem",
              color: "#333",
            }}
          >
            {s.step}
          </h2>
          <pre
            style={{
              margin: 0,
              fontSize: "0.8rem",
              whiteSpace: "pre-wrap",
              color: "#1a1a1a",
            }}
          >
            {JSON.stringify(s.result, null, 2)}
          </pre>
        </section>
      ))}

      {done && (
        <p
          style={{
            color: "#2a7",
            fontWeight: "bold",
            borderTop: "1px solid #ddd",
            paddingTop: "1rem",
          }}
        >
          Flow complete. All 6 steps passed.
        </p>
      )}
    </main>
  );
}
