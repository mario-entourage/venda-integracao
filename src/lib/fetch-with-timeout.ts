/**
 * Fetch wrapper with timeout support via AbortController.
 * Default timeout: 30 seconds.
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
