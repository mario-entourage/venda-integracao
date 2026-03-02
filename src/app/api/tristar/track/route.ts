import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiUrl = process.env.TRISTAR_API_URL;
  const apiKey = process.env.TRISTAR_API_KEY;

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: 'TriStar API credentials not configured' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const shipmentId = searchParams.get('id');

  if (!shipmentId) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  try {
    const tristarRes = await fetch(`${apiUrl}tracking/${shipmentId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await tristarRes.json();

    if (!tristarRes.ok) {
      console.error('[tristar/track] TriStar API error:', tristarRes.status, data);
      return NextResponse.json(
        { error: 'TriStar API error', details: data },
        { status: tristarRes.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[tristar/track] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to track shipment' }, { status: 500 });
  }
}
