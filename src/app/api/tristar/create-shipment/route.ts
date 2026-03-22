import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { TriStarCreateShipmentRequest, TriStarShipmentResponse, TriStarItemTypeValue } from '@/types/shipping';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

const ShipmentItemSchema = z.object({
  shipment_item_type: z.number().int(),
  description: z.string().min(1, 'Item description is required'),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  anvisa_import_authorization_number: z.string().optional(),
  anvisa_product_commercial_name: z.string().optional(),
});

// Validates the dialog-side payload (recipient fields only; sender fields are added server-side).
const BodySchema = z.object({
  to_name: z.string().min(1, 'to_name is required'),
  to_document: z.string().min(1, 'to_document is required'),
  to_address: z.string().min(1, 'to_address is required'),
  to_number: z.string().min(1, 'to_number is required'),
  to_complement: z.string().optional(),
  to_neighborhood: z.string().min(1, 'to_neighborhood is required'),
  to_city: z.string().min(1, 'to_city is required'),
  to_state: z.string().min(1, 'to_state is required'),
  to_country: z.string().min(1, 'to_country is required'),
  to_postcode: z.string().min(1, 'to_postcode is required'),
  to_phone: z.string().optional(),
  to_email: z.string().optional(),
  items: z.array(ShipmentItemSchema).min(1, 'At least one item is required'),
  with_insurance: z.boolean(),
  insurance_value: z.number().optional(),
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

  // Collect and validate sender env vars
  const fromName = process.env.TRISTAR_FROM_NAME;
  const fromDocument = process.env.TRISTAR_FROM_DOCUMENT;
  const fromAddress = process.env.TRISTAR_FROM_ADDRESS;
  const fromNumber = process.env.TRISTAR_FROM_NUMBER;
  const fromNeighborhood = process.env.TRISTAR_FROM_NEIGHBORHOOD;
  const fromCity = process.env.TRISTAR_FROM_CITY;
  const fromState = process.env.TRISTAR_FROM_STATE;
  const fromCountry = process.env.TRISTAR_FROM_COUNTRY ?? 'US';
  const fromPostcode = process.env.TRISTAR_FROM_POSTCODE;
  const fromPhone = process.env.TRISTAR_FROM_PHONE;
  const fromEmail = process.env.TRISTAR_FROM_EMAIL;
  const integrationCode = parseInt(process.env.TRISTAR_INTEGRATION_CODE ?? '1', 10);

  const missingVars = (
    [
      ['TRISTAR_FROM_NAME', fromName],
      ['TRISTAR_FROM_DOCUMENT', fromDocument],
      ['TRISTAR_FROM_ADDRESS', fromAddress],
      ['TRISTAR_FROM_NUMBER', fromNumber],
      ['TRISTAR_FROM_NEIGHBORHOOD', fromNeighborhood],
      ['TRISTAR_FROM_CITY', fromCity],
      ['TRISTAR_FROM_STATE', fromState],
      ['TRISTAR_FROM_POSTCODE', fromPostcode],
      ['TRISTAR_FROM_PHONE', fromPhone],
      ['TRISTAR_FROM_EMAIL', fromEmail],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missingVars.length > 0) {
    console.error('[tristar/create-shipment] Missing sender env vars:', missingVars);
    return NextResponse.json(
      { error: 'TriStar sender configuration incomplete', missing: missingVars },
      { status: 500 },
    );
  }

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  const tristarPayload: TriStarCreateShipmentRequest = {
    ...body,
    // Cast Zod-inferred `number` back to the const literal union TriStarItemTypeValue
    items: body.items.map((item) => ({
      ...item,
      shipment_item_type: item.shipment_item_type as TriStarItemTypeValue,
    })),
    from_name: fromName!,
    from_document: fromDocument!,
    from_address: fromAddress!,
    from_number: fromNumber!,
    from_complement: process.env.TRISTAR_FROM_COMPLEMENT,
    from_neighborhood: fromNeighborhood!,
    from_city: fromCity!,
    from_state: fromState!,
    from_country: fromCountry,
    from_postcode: fromPostcode!,
    from_phone: fromPhone!,
    from_email: fromEmail!,
    integration_code: integrationCode,
  };

  try {
    const tristarRes = await fetch(`${apiUrl}shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(tristarPayload),
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
