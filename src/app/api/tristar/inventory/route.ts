import { NextRequest, NextResponse } from 'next/server';
import type { TriStarStockListResponse } from '@/types/shipping';
import { requireAuth } from '../../_require-auth';

/**
 * Fetch current stock/inventory levels from the TriStar Express API.
 *
 * GET /api/tristar/inventory
 * Query params:
 *   - page (optional): pagination page number
 *   - per_page (optional): items per page (default 100)
 *
 * TriStar endpoint: GET /stocks
 */
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
  const page = searchParams.get('page') || '1';
  const perPage = searchParams.get('per_page') || '100';

  try {
    // Fetch all pages of stock data from TriStar
    const allItems: TriStarStockListResponse['data'] = [];
    let currentPage = parseInt(page, 10);
    let lastPage = 1;

    do {
      const url = new URL(`${apiUrl}stocks`);
      url.searchParams.set('page', String(currentPage));
      url.searchParams.set('per_page', perPage);

      const tristarRes = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!tristarRes.ok) {
        const errorData = await tristarRes.json().catch(() => ({}));
        console.error('[tristar/inventory] TriStar API error:', tristarRes.status, errorData);
        return NextResponse.json(
          { error: 'TriStar API error', details: errorData },
          { status: tristarRes.status },
        );
      }

      const data: TriStarStockListResponse = await tristarRes.json();

      // Handle response: could be { data: [...] } or plain array
      const items = Array.isArray(data) ? data : (data.data ?? []);
      allItems.push(...items);

      // Check pagination
      if (data.meta) {
        lastPage = data.meta.last_page;
      } else {
        // No pagination metadata — assume single page
        break;
      }

      currentPage++;
    } while (currentPage <= lastPage);

    return NextResponse.json({
      data: allItems,
      total: allItems.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[tristar/inventory] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory from TriStar' },
      { status: 500 },
    );
  }
}
