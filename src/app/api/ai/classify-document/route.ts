import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface DocumentClassification {
  documentType: string;
  confidence: number;
  _error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ documentType: 'general', confidence: 0, _error: 'imageBase64 is required' }, { status: 400 });
    }

    const { classifyDocumentFlow } = await import('@/ai/flows/classify-document');
    const result = await classifyDocumentFlow({ imageBase64, mimeType });

    return NextResponse.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Document classification error:', errMsg);

    return NextResponse.json(
      { documentType: 'general', confidence: 0, _error: 'Classificacao falhou.' } satisfies DocumentClassification,
      { status: 500 },
    );
  }
}
