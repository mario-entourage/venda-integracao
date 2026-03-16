'use client';

/**
 * Administracao — Mock Admin Panel (dev only)
 *
 * This page is part of the isolated mock system under /mocks.
 * It is safe to remove along with the entire /mocks folder when
 * integrating real services (Firebase, Stripe, etc).
 *
 * Root cause of "button does nothing" pattern:
 *   1. Missing 'use client'  → onClick silently ignored in RSC
 *   2. No useState           → result has nowhere to live
 *   3. Button inside <form>  → default submit hijacks the click
 *   4. Missing type="button" → browser treats it as type="submit"
 *
 * All four are handled below.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createAdmin, createProduct, listOrders } from '@/mocks/services/adminService';
import type { MockUser } from '@/mocks/types/user';
import type { MockProduct } from '@/mocks/types/product';
import type { MockOrder } from '@/mocks/types/order';

export default function AdministracaoPage() {
  const [admin, setAdmin] = useState<MockUser | null>(null);
  const [product, setProduct] = useState<MockProduct | null>(null);
  const [orders, setOrders] = useState<MockOrder[] | null>(null);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleCreateAdmin = () => {
    const created = createAdmin();
    console.log('[Administracao] Admin created:', created);
    setAdmin(created);
  };

  const handleCreateProduct = () => {
    // Demo product: price in cents (4990 = R$49,90)
    const created = createProduct('Produto Demo', 4990, 50);
    console.log('[Administracao] Product created:', created);
    setProduct(created);
  };

  const handleListOrders = () => {
    const result = listOrders();
    console.log('[Administracao] Orders listed:', result);
    setOrders(result);
  };

  // ── UI ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Administração (Mock)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Painel de testes do sistema mock. Remover antes de produção.
        </p>
      </div>

      {/* ── Create Admin ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/*
            IMPORTANT: Button is NOT inside a <form>.
            type="button" prevents any accidental form submission
            if a form wrapper is ever added in the future.
          */}
          <Button type="button" onClick={handleCreateAdmin}>
            Create Admin
          </Button>

          {admin && (
            <pre className="bg-muted rounded-md p-4 text-xs overflow-auto">
              {JSON.stringify(admin, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* ── Create Product ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar Produto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" variant="secondary" onClick={handleCreateProduct}>
            Create Product
          </Button>

          {product && (
            <pre className="bg-muted rounded-md p-4 text-xs overflow-auto">
              {JSON.stringify(product, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* ── List Orders ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listar Pedidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" variant="outline" onClick={handleListOrders}>
            List Orders
          </Button>

          {orders !== null && (
            <pre className="bg-muted rounded-md p-4 text-xs overflow-auto">
              {orders.length === 0
                ? '// Nenhum pedido no mockDB ainda.'
                : JSON.stringify(orders, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
