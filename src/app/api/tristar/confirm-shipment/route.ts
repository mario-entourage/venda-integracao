import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

const BodySchema = z.object({
  shipmentId: z.string().min(1, 'shipmentId is required'),
});

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
    const tristarRes = await fetch(`${apiUrl}shipments/${body.shipmentId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await tristarRes.json();

    if (!tristarRes.ok) {
      console.error('[tristar/confirm-shipment] TriStar API error:', tristarRes.status, data);
      return NextResponse.json(
        { error: 'TriStar API error', details: data },
        { status: tristarRes.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[tristar/confirm-shipment] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to confirm shipment' }, { status: 500 });
  }
}
