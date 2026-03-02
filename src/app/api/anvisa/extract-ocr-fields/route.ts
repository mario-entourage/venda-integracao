import { NextRequest, NextResponse } from 'next/server';
import { extractOcrFields, ExtractOcrFieldsInput } from '@/ai/flows/anvisa/extract-ocr-fields';

export async function POST(request: NextRequest) {
  try {
    const body: ExtractOcrFieldsInput = await request.json();
    const result = await extractOcrFields(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in extract-ocr-fields API:', error);
    return NextResponse.json({ error: 'Failed to extract OCR fields' }, { status: 500 });
  }
}
