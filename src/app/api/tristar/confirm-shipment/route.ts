import { NextRequest, NextResponse } from 'next/server';

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
    const { shipmentId }: { shipmentId: string } = await request.json();

    if (!shipmentId) {
      return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
    }

    const tristarRes = await fetch(`${apiUrl}shipments/${shipmentId}/confirm`, {
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
