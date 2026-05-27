import type { NextRequest } from 'next/server';
import { requireAdminSimple } from '../../../_require-admin-simple';
import { revokeApiKey } from '@/services/api-keys.service';

/**
 * DELETE /api/admin/api-keys/[id] — revoke (soft-delete) an API key.
 * The document is kept for audit trail; `active=false` blocks all future use.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminSimple(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing key id' }, { status: 400 });

  await revokeApiKey(id, auth.uid);
  return Response.json({ ok: true });
}
