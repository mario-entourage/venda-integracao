import type { NextRequest } from 'next/server';
import { requireApiKey } from '../../../_require-api-key';

/**
 * GET /api/external/v1/logistics
 *
 * Requires API key with level >= L1.
 *
 * Placeholder endpoint. We are migrating shipping providers (TriStar →
 * Memphis); this route is reserved so external clients can wire up against
 * a stable URL today and start receiving real data once the new integration
 * lands.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request, 'L1');
  if (auth instanceof Response) return auth;

  return Response.json({
    notice: 'Logistics endpoint reserved. No fields exposed yet pending migration to the new shipping provider.',
    provider: null,
    shipments: [],
  });
}
