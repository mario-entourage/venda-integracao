import type { NextRequest } from 'next/server';
import {
  findActiveApiKeyByPlaintext,
  recordApiKeyUsage,
  writeApiAccessLog,
} from '@/services/api-keys.service';
import {
  type ApiKey,
  type ApiKeyLevel,
  levelSatisfies,
} from '@/types/api-key';

export type ApiKeyIdentity = {
  keyId: string;
  keyName: string;
  level: ApiKeyLevel;
};

/**
 * Validates that the incoming request carries a valid, active external API
 * key with permission level >= `requiredLevel`. Tiers are cumulative
 * (L3 ⊃ L2 ⊃ L1).
 *
 * On success:
 *   - records usage on the key document (lastUsedAt + requestCount)
 *   - writes an entry to api_key_access_log (LGPD accountability)
 *   - returns an ApiKeyIdentity
 *
 * On failure: returns a Response (401 or 403). Callers must check:
 *   if (result instanceof Response) return result;
 *
 * Header format: `Authorization: Bearer <plaintext-key>`
 */
export async function requireApiKey(
  request: NextRequest,
  requiredLevel: ApiKeyLevel,
): Promise<ApiKeyIdentity | Response> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json(
      { error: 'API key required. Expected: Authorization: Bearer <key>' },
      { status: 401 },
    );
  }

  const plaintext = authHeader.slice(7).trim();
  if (!plaintext) {
    return Response.json({ error: 'Empty API key' }, { status: 401 });
  }

  let key: ApiKey | null;
  try {
    key = await findActiveApiKeyByPlaintext(plaintext);
  } catch (err) {
    console.error('[require-api-key] Lookup failed:', err);
    return Response.json({ error: 'Internal error during key validation' }, { status: 500 });
  }

  const endpoint = new URL(request.url).pathname;
  const method = request.method;

  if (!key) {
    return Response.json({ error: 'Invalid or revoked API key' }, { status: 401 });
  }

  if (!levelSatisfies(key.level, requiredLevel)) {
    // Log the denied request before returning so abuse is traceable
    await writeApiAccessLog({
      apiKeyId: key.id,
      keyName: key.name,
      level: key.level,
      endpoint,
      method,
      status: 403,
    });
    return Response.json(
      {
        error: 'Insufficient permission level for this resource',
        required: requiredLevel,
        granted: key.level,
      },
      { status: 403 },
    );
  }

  // Fire-and-forget — don't block the response on usage tracking
  void recordApiKeyUsage(key.id);
  void writeApiAccessLog({
    apiKeyId: key.id,
    keyName: key.name,
    level: key.level,
    endpoint,
    method,
    status: 200,
  });

  return { keyId: key.id, keyName: key.name, level: key.level };
}
