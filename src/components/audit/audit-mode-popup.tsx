'use client';

import { useState } from 'react';
import { Eye, Clock } from 'lucide-react';
import { useAuditMode } from '@/contexts/audit-mode-context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function formatTimeRemaining(expiresAtMs: number): string {
  const diff = Math.max(0, expiresAtMs - Date.now());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

export function AuditModePopup() {
  const { pendingSession, activateAuditMode, dismissPopup } = useAuditMode();
  const [isActivating, setIsActivating] = useState(false);

  if (!pendingSession) return null;

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await activateAuditMode(pendingSession.id);
    } catch (err) {
      console.error('[AuditPopup] Activation failed:', err);
      setIsActivating(false);
    }
  };

  const timeLeft = formatTimeRemaining(pendingSession.expiresAt.toMillis());

  return (
    <Dialog open onOpenChange={(open) => { if (!open) dismissPopup(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <Eye className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Sessão de Auditoria Ativa</DialogTitle>
              <DialogDescription>Há uma sessão de auditoria pendente.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auditor</span>
              <span className="font-medium">{pendingSession.auditorEmail}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tempo restante</span>
              <span className="flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5" />
                {timeLeft}
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Ao entrar em modo auditoria, sua sessão será convertida para acesso somente-leitura.
            O auditor poderá visualizar todas as telas, mas não poderá fazer alterações.
            Você pode fazer login em outro dispositivo normalmente.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={dismissPopup} disabled={isActivating}>
            Agora não
          </Button>
          <Button onClick={handleActivate} disabled={isActivating}>
            {isActivating ? 'Ativando...' : 'Entrar em Modo Auditoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
