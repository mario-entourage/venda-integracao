'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NovaVendaWizard } from '@/components/vendas/nova-venda-wizard';
import { VendasEmAndamento } from '@/components/vendas/vendas-em-andamento';
import { ResumeVendaWizard } from '@/components/vendas/resume-venda-wizard';

// ─── Inner component (needs access to useSearchParams) ────────────────────────

function VendasPageContent() {
  const [activeTab, setActiveTab] = useState<'em-andamento' | 'nova'>('em-andamento');
  // Bump the key each time the wizard tab is opened so state resets cleanly
  const [wizardKey, setWizardKey] = useState(0);

  const searchParams = useSearchParams();
  const router = useRouter();

  const resumeOrderId = searchParams.get('resume');

  const handleTabChange = (tab: string) => {
    if (tab === 'nova') {
      setWizardKey((k) => k + 1);
    }
    setActiveTab(tab as 'em-andamento' | 'nova');
  };

  const handleVendaComplete = () => {
    setActiveTab('em-andamento');
  };

  const goToNovaVenda = () => {
    setWizardKey((k) => k + 1);
    setActiveTab('nova');
  };

  const handleResumeComplete = () => {
    // Clear the resume param and go back to the list
    router.replace('/remessas');
  };

  // ── Resume mode ─────────────────────────────────────────────────────────────
  // When ?resume=<orderId> is present, skip the tabs and show the resume wizard.
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
            <ResumeVendaWizard
              orderId={resumeOrderId}
              onComplete={handleResumeComplete}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Normal mode (tabs) ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold">Vendas</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="em-andamento">Vendas em andamento</TabsTrigger>
          <TabsTrigger value="nova">Nova venda</TabsTrigger>
        </TabsList>

        <TabsContent value="em-andamento" className="mt-4">
          <VendasEmAndamento onNewVenda={goToNovaVenda} />
        </TabsContent>

        <TabsContent value="nova" className="mt-4">
          <Card>
            <CardContent className="pt-6 pb-8">
              <NovaVendaWizard key={wizardKey} onComplete={handleVendaComplete} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
