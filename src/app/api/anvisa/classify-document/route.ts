import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyDocument, ClassifyDocumentInput } from '@/ai/flows/anvisa/classify-document';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

const BodySchema = z.object({
  fileDataUrl: z.string().min(1, 'fileDataUrl is required'),
  contentType: z.string().min(1, 'contentType is required'),
  fileName: z.string().min(1, 'fileName is required'),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  try {
    const result = await classifyDocument(body as ClassifyDocumentInput);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in classify-document API:', error);
    return NextResponse.json({ error: 'Failed to classify document' }, { status: 500 });
  }
}
