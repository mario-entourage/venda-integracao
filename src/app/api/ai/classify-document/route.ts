import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // TODO: Wire up classifyDocumentFlow from @/ai/flows/classify-document
  const body = await request.json();
  return NextResponse.json({ documentType: 'unknown', confidence: 0 });
}
