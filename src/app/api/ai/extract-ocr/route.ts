import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

const BodySchema = z.object({
  imageBase64: z.string().min(1, 'imageBase64 is required'),
  mimeType: z.string().optional().default('image/jpeg'),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  // TODO: Wire up extractOcrFieldsFlow from @/ai/flows/extract-ocr-fields
  void body;
  return NextResponse.json({ fields: {} });
}
