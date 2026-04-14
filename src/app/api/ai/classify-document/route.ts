import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

export const dynamic = 'force-dynamic';

export interface DocumentClassification {
  documentType: string;
  confidence: number;
  _error?: string;
}

const BodySchema = z.object({
  imageBase64: z.string().min(1, 'imageBase64 is required'),
  mimeType: z.string().optional().default('image/jpeg'),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  try {
    const { classifyDocumentFlow } = await import('@/ai/flows/classify-document');
    const result = await classifyDocumentFlow(body);

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
