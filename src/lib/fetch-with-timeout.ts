/**
 * Fetch wrapper with timeout support via AbortController.
 * Default timeout: 30 seconds.
 *
 * Intercepts 401 responses on /api/* routes with:
 *  - A loud console.error for developers (with fix instructions)
 *  - A rewritten response body with a user-friendly error code
 *    that users can screenshot and send to admins
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
    if (response.status === 401 && url.startsWith('/api/')) {
      const route = url.split('?')[0];                 // strip query params
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // 20260323143012
      const errorCode = `AUTH-${ts}-${route.replace(/\//g, '-').slice(1)}`;

      // Developer breadcrumb — loud, with stack trace + fix instructions
      const hasAuthHeader = options.headers instanceof Headers
        ? options.headers.has('Authorization')
        : Array.isArray(options.headers)
          ? options.headers.some(([k]) => k.toLowerCase() === 'authorization')
          : options.headers && 'Authorization' in options.headers;

      console.error(
        `\n🚨 [AUTH ERROR] 401 Unauthorized on ${route}\n` +
        `   Error code: ${errorCode}\n` +
        (hasAuthHeader
          ? `   Authorization header was sent but the token was rejected (expired or invalid).\n`
          : `   No Authorization header was sent — use useAuthFetch() or authFetchWithToken().\n`) +
        `\n` +
        `HOW TO FIX:\n` +
        `  In a React component → use the useAuthFetch() hook:\n` +
        `    const authFetch = useAuthFetch();\n` +
        `    const res = await authFetch('${route}', { method: '...' });\n` +
        `\n` +
        `  In a service file → use authFetchWithToken():\n` +
        `    import { authFetchWithToken } from '@/hooks/use-auth-fetch';\n` +
        `    const res = await authFetchWithToken(idToken, '${route}', { method: '...' });\n` +
        `\n` +
        `See: src/hooks/use-auth-fetch.ts | CLAUDE.md → Authentication | NFR-03.7a\n`,
      );

      // Rewrite the response body so callers that read `data.error`
      // show users a message they can screenshot and send to an admin.
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            `Erro de autenticação. Sua sessão pode ter expirado.\n` +
            `Recarregue a página e tente novamente.\n\n` +
            `Se o problema persistir, envie esta mensagem ao administrador:\n` +
            `Código: ${errorCode}`,
          _errorCode: errorCode,
          _route: route,
          _timestamp: new Date().toISOString(),
        }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        },
      );
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
