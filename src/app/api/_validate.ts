import type { NextRequest } from 'next/server';
import type { ZodSchema } from 'zod';

/**
 * Parses and validates the request body against a Zod schema.
 *
 * Returns the validated (and coerced) data on success, or a Response with a
 * 400/422 status and structured error details on failure.
 *
 * Callers must check: if (result instanceof Response) return result;
 *
 * @example
 * const body = await validateBody(request, z.object({ name: z.string() }));
 * if (body instanceof Response) return body;
 * // body is now typed correctly
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return Response.json(
      { ok: false, error: 'Validation failed', details: result.error.flatten() },
      { status: 422 },
    );
  }

  return result.data;
}
