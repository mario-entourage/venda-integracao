'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { NovaVendaWizard } from '@/components/vendas/nova-venda-wizard';
import { VendasEmAndamento } from '@/components/vendas/vendas-em-andamento';

export default function VendasPage() {
  const [activeTab, setActiveTab] = useState<'em-andamento' | 'nova'>('em-andamento');
  // Bump the key each time the wizard tab is opened so state resets cleanly
  const [wizardKey, setWizardKey] = useState(0);

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
