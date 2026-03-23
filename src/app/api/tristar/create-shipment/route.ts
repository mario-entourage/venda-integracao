import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { TriStarShipmentResponse, TriStarItemTypeValue } from '@/types/shipping';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

// ─── HS codes by item type ─────────────────────────────────────────────────
// Required by TriStar for customs declaration. CBD/THC use pharmaceutical HS code.
const HSCODE_BY_ITEM_TYPE: Record<number, string> = {
  40: '30049069', // CBD — pharmaceutical preparations containing cannabidiol
  41: '30049069', // THC — same pharmaceutical HS code
  30: '30049099', // Medicamento — other pharmaceutical preparations
  10: '99250000', // Produtos — general merchandise (personal import)
  20: '49019900', // Livros — printed books
  90: '99250000', // Outro (imune) — general merchandise
};

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
  const fromTradingName = process.env.TRISTAR_FROM_TRADING_NAME;
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
      ['TRISTAR_FROM_TRADING_NAME', fromTradingName],
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

  // ── Map our internal field names to TriStar's API field names ────────────
  // TriStar updated their API to require:
  //   - *_person_type (1=physical, 2=juridical)
  //   - *_document_type (1=CPF, 2=CNPJ)
  //   - *_address_1 instead of *_address
  //   - *_state_code instead of *_state
  //   - *_country_code instead of *_country
  //   - from_trading_name (company trade name, required when person_type=2)
  //   - hscode per item (HS tariff code for customs)
  const tristarPayload = {
    // Recipient — always a physical person (individual patient) with CPF
    to_person_type: 1,
    to_document_type: 1,
    to_name: body.to_name,
    to_document: body.to_document,
    to_address_1: body.to_address,
    to_number: body.to_number,
    to_complement: body.to_complement,
    to_neighborhood: body.to_neighborhood,
    to_city: body.to_city,
    to_state_code: body.to_state,
    to_country_code: body.to_country,
    to_postcode: body.to_postcode,
    to_phone: body.to_phone,
    to_email: body.to_email,

    // Sender — always Entourage Lab (juridical entity)
    from_person_type: 2,
    from_document_type: 2,
    from_name: fromName!,
    from_trading_name: fromTradingName!,
    from_document: fromDocument!,
    from_address_1: fromAddress!,
    from_number: fromNumber!,
    from_complement: process.env.TRISTAR_FROM_COMPLEMENT,
    from_neighborhood: fromNeighborhood!,
    from_city: fromCity!,
    from_state_code: fromState!,
    from_country_code: fromCountry,
    from_postcode: fromPostcode!,
    from_phone: fromPhone!,
    from_email: fromEmail!,

    // Items — add hscode per item type
    items: body.items.map((item) => ({
      shipment_item_type: item.shipment_item_type as TriStarItemTypeValue,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      hscode: HSCODE_BY_ITEM_TYPE[item.shipment_item_type] ?? '99250000',
      ...(item.anvisa_import_authorization_number && {
        anvisa_import_authorization_number: item.anvisa_import_authorization_number,
      }),
      ...(item.anvisa_product_commercial_name && {
        anvisa_product_commercial_name: item.anvisa_product_commercial_name,
      }),
    })),

    with_insurance: body.with_insurance,
    insurance_value: body.insurance_value,
    integration_code: integrationCode,
  };

  try {
    const tristarRes = await fetch(`${apiUrl}shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
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
