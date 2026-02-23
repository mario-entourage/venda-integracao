'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DocumentosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
        <p className="text-muted-foreground">Gestao de documentos e autorizacoes ANVISA.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
        </CardContent>
      </Card>
    </div>
  );
}
