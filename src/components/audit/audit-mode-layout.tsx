'use client';

import { useAuditMode } from '@/contexts/audit-mode-context';
import { AuditExpiredScreen } from '@/components/audit/audit-expired-screen';

/**
 * Wraps the main content area. When audit mode is active, adds CSS
 * that disables submit buttons, file inputs, and elements marked
 * with data-audit-block. When the session expires, renders the
 * expiration overlay.
 */
export function AuditModeLayout({ children }: { children: React.ReactNode }) {
  const { isAuditMode, timeRemaining } = useAuditMode();

  // Show expiration screen when time runs out
  if (isAuditMode && timeRemaining <= 0) {
    return <AuditExpiredScreen />;
  }

  return (
    <div className={isAuditMode ? 'audit-read-only' : ''}>
      <style>{`
        .audit-read-only button[type="submit"],
        .audit-read-only input[type="file"],
        .audit-read-only [data-audit-block],
        .audit-read-only .dropzone {
          pointer-events: none !important;
          opacity: 0.4 !important;
          cursor: not-allowed !important;
        }
      `}</style>
      {children}
    </div>
  );
}
