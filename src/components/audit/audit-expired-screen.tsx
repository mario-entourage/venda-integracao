'use client';

import { useState } from 'react';
import { Clock, Mail } from 'lucide-react';
import { useAuditMode } from '@/contexts/audit-mode-context';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MODULE_KEYS, type ModuleKey } from '@/types/audit';

export function AuditExpiredScreen() {
  const { auditSession, deactivateAuditMode } = useAuditMode();
  const { user } = useFirebase();
  const [requestSent, setRequestSent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  if (!auditSession) return null;

  const modulesLabel = auditSession.modulesVisited
    .map((k) => MODULE_KEYS[k as ModuleKey] || k)
    .join(', ');

  const handleRequestMoreTime = async () => {
    setIsSending(true);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) { console.error('[AuditExpired] No auth token'); setIsSending(false); return; }
      await fetch('/api/notifications/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          to: auditSession.creatingUserEmail,
          subject: 'Solicitação de Extensão de Auditoria',
          html: `
            <p>Olá,</p>
            <p>O auditor (<strong>${auditSession.auditorEmail}</strong>) está solicitando mais tempo para a sessão de auditoria.</p>
            <ul>
              <li><strong>Módulos visitados:</strong> ${modulesLabel || 'Nenhum'}</li>
            </ul>
            <p>Para conceder mais tempo, acesse a plataforma e crie uma nova sessão de auditoria.</p>
            <p>Atenciosamente,<br/>Entourage Lab</p>
          `,
        }),
      });
      setRequestSent(true);
    } catch (e) {
      console.error('[AuditExpired] Failed to send request email:', e);
    } finally {
      setIsSending(false);
    }
  };

  const handleSignOut = () => {
    deactivateAuditMode('expired');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
            <Clock className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-xl">Sessão de Auditoria Expirada</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            O tempo de acesso para esta sessão de auditoria expirou.
            Você não tem mais permissão para visualizar os dados do sistema.
          </p>

          {requestSent ? (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
              <p className="font-medium">Solicitação enviada!</p>
              <p className="mt-1 text-xs">
                O administrador foi notificado. Se aprovado, uma nova sessão será criada.
              </p>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={handleRequestMoreTime}
              disabled={isSending}
              className="gap-2"
            >
              <Mail className="h-4 w-4" />
              {isSending ? 'Enviando...' : 'Solicitar Mais Tempo'}
            </Button>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="destructive" onClick={handleSignOut}>
            Sair
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
