'use client';

import { useAuditMode } from '@/contexts/audit-mode-context';

/**
 * Wraps the main content area. When audit mode is active, adds CSS
 * that disables submit buttons, file inputs, and elements marked
 * with data-audit-block.
 */
export function AuditModeLayout({ children }: { children: React.ReactNode }) {
  const { isAuditMode } = useAuditMode();

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
