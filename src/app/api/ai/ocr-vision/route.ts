/**
 * POST /api/ai/ocr-vision
 *
 * Calls the Google Cloud Vision TEXT_DETECTION API with a base64-encoded
 * prescription image, then parses the raw OCR text to return structured
 * product rows.
 *
 * Authentication: uses the same GOOGLE_GENAI_API_KEY that Genkit uses —
 * make sure the Cloud Vision API is enabled on the same GCP project.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS_CATALOG } from '@/data/products-catalog';
import { parseOcrPrescription, type OcrProductRow } from '@/lib/parse-ocr-prescription';

export const dynamic = 'force-dynamic';

export interface OcrVisionResult {
  rows: OcrProductRow[];
  rawText: string;
  _error?: string;
}

const NA_ROW = (): OcrProductRow => ({
  id: crypto.randomUUID(),
  stockProductId: 'n/a',
  productName: 'n/a',
  quantity: 'n/a',
  price: 'n/a',
  discount: 'n/a',
});

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GENAI_API_KEY is not configured');
    }

    // ── Step 1: call Cloud Vision TEXT_DETECTION ──────────────────────────
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            },
          ],
        }),
      },
    );

    if (!visionRes.ok) {
      const body = await visionRes.text();
      throw new Error(`Cloud Vision API ${visionRes.status}: ${body}`);
    }

    const visionData = await visionRes.json();

    // ── Step 2: retrieve full text from first annotation ─────────────────
    // textAnnotations[0].description contains the complete detected text block.
    const annotations: Array<{ description: string; confidence?: number }> =
      visionData.responses?.[0]?.textAnnotations ?? [];

    if (annotations.length === 0) {
      // No text detected at all — return empty rows (not an error row)
      return NextResponse.json({ rows: [], rawText: '' } satisfies OcrVisionResult);
    }

    const rawText: string = annotations[0].description ?? '';

    // Check overall confidence if available (fullTextAnnotation level)
    const fullAnnotation = visionData.responses?.[0]?.fullTextAnnotation;
    const overallConfidence: number =
      fullAnnotation?.pages?.[0]?.confidence ?? 1.0;

    // ── Step 3-6: parse OCR text → structured product rows ────────────────
    let rows: OcrProductRow[];

    if (overallConfidence < 0.3) {
      // Very low confidence — signal uncertainty with a single n/a row
      rows = [NA_ROW()];
    } else {
      rows = parseOcrPrescription(rawText, PRODUCTS_CATALOG);
    }

    return NextResponse.json({ rows, rawText } satisfies OcrVisionResult);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('OCR Vision error:', errMsg, '| full:', error);

    return NextResponse.json(
      {
        rows: [NA_ROW()],
        rawText: '',
        _error: 'OCR falhou. Verifique a imagem e tente novamente.',
      } satisfies OcrVisionResult,
      { status: 200 },
    );
  }
}
