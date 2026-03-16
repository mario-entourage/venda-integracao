'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NovaVendaWizard } from '@/components/vendas/nova-venda-wizard';

// ─── Inner component (needs access to useSearchParams) ────────────────────────

function VendasPageContent() {
  // Bump the key each time the wizard should reset cleanly
  const [wizardKey, setWizardKey] = useState(0);

  const searchParams = useSearchParams();
  const router = useRouter();

  const resumeOrderId = searchParams.get('resume');

  const handleVendaComplete = (_orderId: string) => {
    // After completing a sale, navigate to Pedidos
    setWizardKey((k) => k + 1);
    router.push('/pedidos');
  };

  const handleResumeComplete = (_orderId: string) => {
    // Clear the resume param and go to pedidos
    router.replace('/pedidos');
  };

  // ── Resume mode ─────────────────────────────────────────────────────────────
  // When ?resume=<orderId> is present, show the full wizard pre-populated.
  if (resumeOrderId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace('/remessas')}
            className="-ml-2"
          >
            ← Voltar
          </Button>
          <h1 className="font-headline text-2xl font-bold">Continuar Venda</h1>
        </div>

        <Card>
          <CardContent className="pt-6 pb-8">
            <NovaVendaWizard
              resumeOrderId={resumeOrderId}
              onComplete={handleResumeComplete}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Normal mode — Nova Venda wizard directly ──────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Nova Venda</h1>

      <Card>
        <CardContent className="pt-6 pb-8">
          <NovaVendaWizard key={wizardKey} onComplete={handleVendaComplete} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page (wraps content in Suspense required by useSearchParams) ──────────────

export default function VendasPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-8 w-32 rounded bg-muted animate-pulse" />
          <div className="h-10 w-64 rounded bg-muted animate-pulse" />
        </div>
      }
    >
      <VendasPageContent />
    </Suspense>
  );
}
