import { NextRequest, NextResponse } from 'next/server';
import type { TriStarCreateShipmentRequest, TriStarShipmentResponse } from '@/types/shipping';

export async function POST(request: NextRequest) {
  const apiUrl = process.env.TRISTAR_API_URL;
  const apiKey = process.env.TRISTAR_API_KEY;

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: 'TriStar API credentials not configured' },
      { status: 500 },
    );
  }

  try {
    const body: TriStarCreateShipmentRequest = await request.json();

    const tristarRes = await fetch(`${apiUrl}shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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
