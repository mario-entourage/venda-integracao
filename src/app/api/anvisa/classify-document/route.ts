import { NextRequest, NextResponse } from 'next/server';
import { classifyDocument, ClassifyDocumentInput } from '@/ai/flows/anvisa/classify-document';

export async function POST(request: NextRequest) {
  try {
    const body: ClassifyDocumentInput = await request.json();
    const result = await classifyDocument(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in classify-document API:', error);
    return NextResponse.json({ error: 'Failed to classify document' }, { status: 500 });
  }
}
