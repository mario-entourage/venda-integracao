import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../_require-auth';

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const shipmentId = searchParams.get('id');

  if (!shipmentId) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  try {
    const tristarRes = await fetch(`${apiUrl}shipments/${shipmentId}/label`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!tristarRes.ok) {
      const data = await tristarRes.json().catch(() => ({}));
      console.error('[tristar/label] TriStar API error:', tristarRes.status, data);
      return NextResponse.json(
        { error: 'TriStar API error', details: data },
        { status: tristarRes.status },
      );
    }

    // Check if the response is a PDF or JSON with a URL
    const contentType = tristarRes.headers.get('content-type') ?? '';
    if (contentType.includes('application/pdf')) {
      // Proxy the PDF binary directly
      const pdfBuffer = await tristarRes.arrayBuffer();
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="label-${shipmentId}.pdf"`,
        },
      });
    }

    // Otherwise return JSON (may contain label_url)
    const data = await tristarRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[tristar/label] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to fetch label' }, { status: 500 });
  }
}
