'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
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

  // Check for an unfinished wizard session in sessionStorage
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('nova-venda-wizard');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.state?.orderId) setSavedOrderId(parsed.state.orderId);
      }
    } catch { /* ignore */ }
  }, []);

  const dismissSavedOrder = () => {
    sessionStorage.removeItem('nova-venda-wizard');
    setSavedOrderId(null);
  };

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

      {/* Resume banner for unfinished wizard session */}
      {savedOrderId && !resumeOrderId && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="flex-1 text-amber-900 dark:text-amber-200">
            Você tem uma venda não finalizada.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/remessas?resume=${savedOrderId}`)}
          >
            Continuar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismissSavedOrder}
          >
            Descartar
          </Button>
        </div>
      )}

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
