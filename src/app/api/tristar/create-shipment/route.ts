import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { TriStarCreateShipmentRequest, TriStarShipmentResponse } from '@/types/shipping';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

// Validate the required top-level fields; TriStar API enforces deeper field rules server-side.
const BodySchema = z.object({
  order_number: z.string().min(1, 'order_number is required'),
  recipient: z.object({
    name: z.string().min(1),
    address: z.string().min(1),
  }).passthrough(),
}).passthrough();

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const apiUrl = process.env.TRISTAR_API_URL;
  const apiKey = process.env.TRISTAR_API_KEY;

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: 'TriStar API credentials not configured' },
      { status: 500 },
    );
  }

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  try {
    const tristarRes = await fetch(`${apiUrl}shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body as unknown as TriStarCreateShipmentRequest),
    });

    const data: TriStarShipmentResponse = await tristarRes.json();

    if (!tristarRes.ok) {
      console.error('[tristar/create-shipment] TriStar API error:', tristarRes.status, data);
      return NextResponse.json(
        { error: 'TriStar API error', details: data },
        { status: tristarRes.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[tristar/create-shipment] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to create shipment' }, { status: 500 });
  }
}
