import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // TODO: Wire up extractOcrFieldsFlow from @/ai/flows/extract-ocr-fields
  const body = await request.json();
  return NextResponse.json({ fields: {} });
}
