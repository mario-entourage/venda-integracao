/**
 * Fetch wrapper with timeout support via AbortController.
 * Default timeout: 30 seconds.
 *
 * Also intercepts 401 responses on /api/* routes with a loud developer
 * warning — so missing Authorization headers never fail silently again.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 30_000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    // ── 401 guardrail for /api/* routes ──────────────────────────────
    // If a protected API route returns 401, it almost always means the
    // caller forgot to use useAuthFetch() or authFetchWithToken().
    // This console.error acts as a stack-trace breadcrumb so devs can
    // find the broken call site immediately.
    if (response.status === 401 && url.startsWith('/api/')) {
      const hasAuthHeader = options.headers instanceof Headers
        ? options.headers.has('Authorization')
        : Array.isArray(options.headers)
          ? options.headers.some(([k]) => k.toLowerCase() === 'authorization')
          : options.headers && 'Authorization' in options.headers;

      if (!hasAuthHeader) {
        console.error(
          `\n🚨 [AUTH ERROR] 401 Unauthorized on ${url}\n` +
          `\n` +
          `This API route requires authentication but no Authorization header was sent.\n` +
          `\n` +
          `HOW TO FIX:\n` +
          `  In a React component → use the useAuthFetch() hook:\n` +
          `    const authFetch = useAuthFetch();\n` +
          `    const res = await authFetch('${url}', { method: '...' });\n` +
          `\n` +
          `  In a service file → use authFetchWithToken():\n` +
          `    import { authFetchWithToken } from '@/hooks/use-auth-fetch';\n` +
          `    const res = await authFetchWithToken(idToken, '${url}', { method: '...' });\n` +
          `\n` +
          `See: src/hooks/use-auth-fetch.ts\n` +
          `See: CLAUDE.md → Authentication section\n` +
          `See: docs/requirements.md → NFR-03.7a\n`,
        );
      }
    }

    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('A requisição excedeu o tempo limite. Tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
