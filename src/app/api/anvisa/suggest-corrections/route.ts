import { NextRequest, NextResponse } from 'next/server';
import { suggestCorrections, SuggestCorrectionsInput } from '@/ai/flows/anvisa/suggest-corrections';

export async function POST(request: NextRequest) {
  try {
    const body: SuggestCorrectionsInput = await request.json();
    const result = await suggestCorrections(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in suggest-corrections API:', error);
    return NextResponse.json({ error: 'Failed to get suggestions' }, { status: 500 });
  }
}
