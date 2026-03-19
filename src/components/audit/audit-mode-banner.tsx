'use client';

import { Eye, Clock } from 'lucide-react';
import { useAuditMode } from '@/contexts/audit-mode-context';

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Expirado';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h ${m}min`;
  }
  if (h > 0) return `${h}h ${m}min ${s}s`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

export function AuditModeBanner() {
  const { isAuditMode, auditSession, timeRemaining } = useAuditMode();

  if (!isAuditMode || !auditSession) return null;

  const isUrgent = timeRemaining < 300; // < 5 minutes

  return (
    <div
      className={`flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium ${
        isUrgent
          ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
      }`}
    >
      <Eye className="h-4 w-4 shrink-0" />
      <span>Modo Auditoria — Somente Leitura</span>
      <span className="text-muted-foreground">|</span>
      <span>{auditSession.auditorEmail}</span>
      <span className="text-muted-foreground">|</span>
      <span className="flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" />
        {formatCountdown(timeRemaining)}
      </span>
    </div>
  );
}
