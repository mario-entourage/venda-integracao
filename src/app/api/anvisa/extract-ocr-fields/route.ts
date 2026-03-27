import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractOcrFields, ExtractOcrFieldsInput } from '@/ai/flows/anvisa/extract-ocr-fields';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

const BodySchema = z.object({
  documentType: z.enum(['DOCUMENTO_PACIENTE', 'COMPROVANTE_RESIDENCIA', 'PROCURACAO', 'RECEITA_MEDICA']),
  fileUrl: z.string().min(1, 'fileUrl is required'),
  contentType: z.string().min(1, 'contentType is required'),
  ocrText: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  try {
    const result = await extractOcrFields(body as ExtractOcrFieldsInput);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in extract-ocr-fields API:', error);
    return NextResponse.json({ error: 'Failed to extract OCR fields' }, { status: 500 });
  }
}
