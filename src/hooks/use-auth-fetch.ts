'use client';

import { useCallback } from 'react';
import { useFirebase } from '@/firebase';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

/**
 * Hook that returns an authenticated fetch wrapper.
 *
 * Automatically injects `Authorization: Bearer <firebase-id-token>` into every
 * request. Throws if the user session has expired so callers get a clear error
 * instead of a silent 401.
 *
 * Usage:
 *   const authFetch = useAuthFetch();
 *   const res = await authFetch('/api/payments/sync', { method: 'POST', body: ... });
 */
export function useAuthFetch() {
  const { user } = useFirebase();

  return useCallback(
    async (url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> => {
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('Sessão expirada. Recarregue a página.');
      }

      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${idToken}`);

      // Default Content-Type for JSON bodies if not already set
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      return fetchWithTimeout(url, { ...options, headers });
    },
    [user],
  );
}

/**
 * Standalone helper for non-component code (services, utilities).
 * Callers must provide the idToken themselves.
 *
 * Usage:
 *   const idToken = await user?.getIdToken();
 *   const res = await authFetchWithToken(idToken, '/api/notifications/send-email', { ... });
 */
export async function authFetchWithToken(
  idToken: string | undefined,
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  if (!idToken) {
    throw new Error('Sessão expirada. Recarregue a página.');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${idToken}`);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetchWithTimeout(url, { ...options, headers });
}
