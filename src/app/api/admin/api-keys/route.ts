import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdminSimple } from '../../_require-admin-simple';
import { validateBody } from '../../_validate';
import { createApiKey, listApiKeys } from '@/services/api-keys.service';
import { API_KEY_LEVELS } from '@/types/api-key';

/**
 * GET  /api/admin/api-keys  — list all API keys (metadata only; no plaintext)
 * POST /api/admin/api-keys  — create new key. Plaintext is returned ONCE in
 *                              the response body and never stored.
 *
 * Admin-only (requireAdminSimple).
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const keys = await listApiKeys();
  return Response.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      level: k.level,
      active: k.active,
      createdAt:
        k.createdAt && typeof k.createdAt.toDate === 'function'
          ? k.createdAt.toDate().toISOString()
          : null,
      createdByEmail: k.createdByEmail,
      lastUsedAt:
        k.lastUsedAt && typeof k.lastUsedAt.toDate === 'function'
          ? k.lastUsedAt.toDate().toISOString()
          : null,
      requestCount: k.requestCount ?? 0,
      revokedAt:
        k.revokedAt && typeof k.revokedAt.toDate === 'function'
          ? k.revokedAt.toDate().toISOString()
          : null,
    })),
  });
}

const CreateBody = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  level: z.enum(API_KEY_LEVELS as [string, ...string[]]),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, CreateBody);
  if (body instanceof Response) return body;

  const result = await createApiKey({
    name: body.name,
    level: body.level as 'L1' | 'L2' | 'L3',
    createdById: auth.uid,
    createdByEmail: auth.email,
  });

  return Response.json(
    {
      id: result.id,
      plaintext: result.plaintext,
      keyPrefix: result.keyPrefix,
      notice:
        'Store this key now — it cannot be retrieved later. Only its hash is persisted server-side.',
    },
    { status: 201 },
  );
}
