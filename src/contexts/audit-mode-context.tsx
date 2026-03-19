'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useFirebase } from '@/firebase/provider';
import {
  getActiveSessionForUser,
  getAuditSessionById,
  activateAuditSession,
  endAuditSession,
  addModuleVisit,
} from '@/services/audit.service';
import type { AuditSession, ModuleKey } from '@/types/audit';
import { ROUTE_TO_MODULE, MODULE_KEYS } from '@/types/audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditModeContextValue {
  /** True when the current session is in audit (read-only) mode */
  isAuditMode: boolean;
  /** The active audit session data (only set when isAuditMode is true) */
  auditSession: AuditSession | null;
  /** Seconds remaining until the audit session expires */
  timeRemaining: number;
  /** A pending session exists for this admin — show the activation popup */
  pendingSession: AuditSession | null;
  /** Switch the current session into audit mode */
  activateAuditMode: (sessionId: string) => Promise<void>;
  /** End audit mode (sign-out or expiration) */
  deactivateAuditMode: (reason: 'signed_out' | 'expired') => Promise<void>;
  /** Record that a module was visited */
  trackModuleVisit: (moduleKey: ModuleKey) => void;
  /** Dismiss the pending session popup without activating */
  dismissPopup: () => void;
}

const AuditModeContext = createContext<AuditModeContextValue | null>(null);

const STORAGE_KEY = 'audit_session_id';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuditModeProvider({ children }: { children: React.ReactNode }) {
  const { firestore, auth, user, isAdmin } = useFirebase();
  const pathname = usePathname();

  const [isAuditMode, setIsAuditMode] = useState(false);
  const [auditSession, setAuditSession] = useState<AuditSession | null>(null);
  const [pendingSession, setPendingSession] = useState<AuditSession | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [popupDismissed, setPopupDismissed] = useState(false);
  const visitedRef = useRef(new Set<string>());

  // ── Restore audit mode from sessionStorage on mount ─────────────────
  useEffect(() => {
    if (!firestore) return;

    const savedId = sessionStorage.getItem(STORAGE_KEY);
    if (!savedId) return;

    getAuditSessionById(firestore, savedId).then((session) => {
      if (!session) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      const now = Date.now();
      const expiresMs = session.expiresAt.toMillis();

      if (session.status === 'active' && expiresMs > now) {
        setAuditSession(session);
        setIsAuditMode(true);
        setTimeRemaining(Math.floor((expiresMs - now) / 1000));
        visitedRef.current = new Set(session.modulesVisited);
      } else {
        // Session expired or ended while browser was closed
        sessionStorage.removeItem(STORAGE_KEY);
      }
    });
  }, [firestore]);

  // ── Check for pending sessions when admin signs in ──────────────────
  useEffect(() => {
    if (!firestore || !user || !isAdmin || isAuditMode || popupDismissed) return;

    getActiveSessionForUser(firestore, user.uid).then((session) => {
      if (!session) return;

      const now = Date.now();
      const expiresMs = session.expiresAt.toMillis();

      if (expiresMs <= now) {
        // Already expired — update status silently
        endAuditSession(firestore, session.id, 'expired');
        return;
      }

      setPendingSession(session);
    });
  }, [firestore, user, isAdmin, isAuditMode, popupDismissed]);

  // ── Countdown timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuditMode || !auditSession) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const expiresMs = auditSession.expiresAt.toMillis();
      const remaining = Math.max(0, Math.floor((expiresMs - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        // Expiration handled by auth-guard checking timeRemaining
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuditMode, auditSession]);

  // ── Track module visits based on route changes ──────────────────────
  useEffect(() => {
    if (!isAuditMode || !auditSession || !firestore) return;

    // Find the matching module for the current path
    const matchingPrefix = Object.keys(ROUTE_TO_MODULE)
      .filter((prefix) => pathname.startsWith(prefix))
      .sort((a, b) => b.length - a.length)[0];

    if (!matchingPrefix) return;

    const moduleKey = ROUTE_TO_MODULE[matchingPrefix];
    if (visitedRef.current.has(moduleKey)) return;

    visitedRef.current.add(moduleKey);
    addModuleVisit(firestore, auditSession.id, moduleKey).catch(console.error);
  }, [pathname, isAuditMode, auditSession, firestore]);

  // ── Actions ─────────────────────────────────────────────────────────

  const activate = useCallback(async (sessionId: string) => {
    if (!firestore) return;
    await activateAuditSession(firestore, sessionId);
    const session = await getAuditSessionById(firestore, sessionId);
    if (!session) return;

    sessionStorage.setItem(STORAGE_KEY, sessionId);
    setAuditSession(session);
    setIsAuditMode(true);
    setPendingSession(null);

    const expiresMs = session.expiresAt.toMillis();
    setTimeRemaining(Math.max(0, Math.floor((expiresMs - Date.now()) / 1000)));
    visitedRef.current = new Set(session.modulesVisited);
  }, [firestore]);

  const deactivate = useCallback(async (reason: 'signed_out' | 'expired') => {
    if (!firestore || !auditSession) return;

    await endAuditSession(firestore, auditSession.id, reason);

    // Send summary email to creating admin
    const durationMs = auditSession.startedAt
      ? Date.now() - auditSession.startedAt.toMillis()
      : 0;
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    const durationStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;

    const moduleLabels = Array.from(visitedRef.current)
      .map((k) => MODULE_KEYS[k as keyof typeof MODULE_KEYS] || k)
      .join(', ');

    const reasonLabel = reason === 'signed_out' ? 'Saída voluntária' : 'Sessão expirada';

    try {
      await fetch('/api/notifications/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: auditSession.creatingUserEmail,
          subject: 'Sessão de Auditoria Encerrada',
          html: `
            <p>Olá,</p>
            <p>A sessão de auditoria criada por você foi encerrada.</p>
            <ul>
              <li><strong>Auditor:</strong> ${auditSession.auditorEmail}</li>
              <li><strong>Duração:</strong> ${durationStr}</li>
              <li><strong>Módulos visitados:</strong> ${moduleLabels || 'Nenhum'}</li>
              <li><strong>Motivo:</strong> ${reasonLabel}</li>
            </ul>
            <p>Atenciosamente,<br/>Entourage Lab</p>
          `,
        }),
      });
    } catch (e) {
      console.error('[AuditMode] Failed to send summary email:', e);
    }

    // Clean up state
    sessionStorage.removeItem(STORAGE_KEY);
    setAuditSession(null);
    setIsAuditMode(false);
    setTimeRemaining(0);
    visitedRef.current.clear();

    if (reason === 'signed_out') {
      await auth.signOut();
    }
  }, [firestore, auth, auditSession]);

  const trackVisit = useCallback((moduleKey: ModuleKey) => {
    if (!isAuditMode || !auditSession || !firestore) return;
    if (visitedRef.current.has(moduleKey)) return;
    visitedRef.current.add(moduleKey);
    addModuleVisit(firestore, auditSession.id, moduleKey).catch(console.error);
  }, [isAuditMode, auditSession, firestore]);

  const dismissPopup = useCallback(() => {
    setPendingSession(null);
    setPopupDismissed(true);
  }, []);

  return (
    <AuditModeContext.Provider
      value={{
        isAuditMode,
        auditSession,
        timeRemaining,
        pendingSession,
        activateAuditMode: activate,
        deactivateAuditMode: deactivate,
        trackModuleVisit: trackVisit,
        dismissPopup,
      }}
    >
      {children}
    </AuditModeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuditMode() {
  const ctx = useContext(AuditModeContext);
  if (!ctx) throw new Error('useAuditMode must be used within AuditModeProvider');
  return ctx;
}
