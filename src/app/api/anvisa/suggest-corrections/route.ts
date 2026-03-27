import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { suggestCorrections, SuggestCorrectionsInput } from '@/ai/flows/anvisa/suggest-corrections';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

const BodySchema = z.object({
  extractedData: z.record(z.string()),
  confidenceScores: z.record(z.number()),
  missingFields: z.array(z.string()),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  try {
    const result = await suggestCorrections(body as SuggestCorrectionsInput);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in suggest-corrections API:', error);
    return NextResponse.json({ error: 'Failed to get suggestions' }, { status: 500 });
  }
}
