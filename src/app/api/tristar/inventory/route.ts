import { NextResponse } from 'next/server';

/**
 * Tristar Inventory API — Placeholder
 *
 * This route will query Tristar's inventory endpoint once the API contract
 * is established. The expected workflow:
 *
 * 1. GET /api/tristar/inventory
 * 2. This route calls the Tristar API with our API key
 * 3. Response: array of { sku: string; quantity: number; ... }
 * 4. Client-side code matches SKUs to local products and updates stockProducts
 *
 * Environment variables required:
 * - TRISTAR_API_URL (e.g. https://sandbox.tristarexpress.com/v1/)
 * - TRISTAR_API_KEY
 *
 * Expected Tristar response shape (TBD — needs API discovery):
 * {
 *   items: Array<{
 *     sku: string;
 *     product_name: string;
 *     quantity_available: number;
 *     warehouse: string;
 *     last_updated: string; // ISO date
 *   }>;
 * }
 */
export async function GET() {
  // TODO: Implement once Tristar inventory endpoint is discovered
  // const apiUrl = process.env.TRISTAR_API_URL;
  // const apiKey = process.env.TRISTAR_API_KEY;
  //
  // if (!apiUrl || !apiKey) {
  //   return NextResponse.json(
  //     { error: 'Tristar API credentials not configured.' },
  //     { status: 500 },
  //   );
  // }
  //
  // const res = await fetch(`${apiUrl}/inventory`, {
  //   headers: { Authorization: `Bearer ${apiKey}` },
  // });
  //
  // if (!res.ok) {
  //   return NextResponse.json(
  //     { error: `Tristar API error: ${res.status}` },
  //     { status: 502 },
  //   );
  // }
  //
  // const data = await res.json();
  // return NextResponse.json(data);

  return NextResponse.json(
    {
      error: 'Tristar inventory endpoint not yet available.',
      message:
        'This endpoint is a placeholder. The Tristar inventory API needs to be researched and integrated.',
    },
    { status: 501 },
  );
}
