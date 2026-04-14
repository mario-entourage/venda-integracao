import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PRODUCTS_CATALOG } from '@/data/products-catalog';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

export const dynamic = 'force-dynamic';

export interface PrescriptionExtraction {
  patientName: string | null;
  patientDocument: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  /** Date printed on the prescription, formatted as YYYY-MM-DD, or null if not found. */
  prescriptionDate: string | null;
  products: Array<{
    name: string;
    /** SKU from the known product catalog, or null if no match found. */
    catalogSku: string | null;
    concentration: string | null;
    quantity: number | null;
  }>;
  _error?: string;
}

// Build catalog reference block once at module level (static, no runtime cost)
const CATALOG_BLOCK = PRODUCTS_CATALOG.map(
  (p) => `  SKU: ${p.sku} | ${p.name} | ${p.concentration}`,
).join('\n');

const BodySchema = z.object({
  imageBase64: z.string().min(1, 'imageBase64 is required'),
  mimeType: z.string().optional().default('image/jpeg'),
});

// ─── helpers ────────────────────────────────────────────────────────────────

const EMPTY_RESULT: PrescriptionExtraction = {
  patientName: null, patientDocument: null, doctorName: null,
  doctorCrm: null, prescriptionDate: null, products: [],
};

/** Try to extract a JSON object from raw AI text (handles markdown fences, preamble, etc.) */
function extractJson(rawText: string): Record<string, unknown> | null {
  // Strategy 1: find outermost { … }
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}') + 1;
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try { return JSON.parse(rawText.slice(jsonStart, jsonEnd)); } catch { /* try next */ }
  }
  // Strategy 2: strip markdown code fences
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* try next */ }
  }
  // Strategy 3: the entire response is JSON
  try { return JSON.parse(rawText.trim()); } catch { /* give up */ }
  return null;
}

/** Coerce a loosely-typed AI response into PrescriptionExtraction, filling gaps with null */
function coerceExtraction(raw: Record<string, unknown>): PrescriptionExtraction {
  return {
    patientName: typeof raw.patientName === 'string' ? raw.patientName : null,
    patientDocument: typeof raw.patientDocument === 'string' ? raw.patientDocument : null,
    doctorName: typeof raw.doctorName === 'string' ? raw.doctorName : null,
    doctorCrm: typeof raw.doctorCrm === 'string' ? raw.doctorCrm : null,
    prescriptionDate: typeof raw.prescriptionDate === 'string' ? raw.prescriptionDate : null,
    products: Array.isArray(raw.products)
      ? raw.products.map((p: Record<string, unknown>) => ({
          name: typeof p?.name === 'string' ? p.name : '',
          catalogSku: typeof p?.catalogSku === 'string' ? p.catalogSku : null,
          concentration: typeof p?.concentration === 'string' ? p.concentration : null,
          quantity: typeof p?.quantity === 'number' ? p.quantity : null,
        }))
      : [],
  };
}

/** Determine if a transient error is worth retrying */
function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as Record<string, unknown>)?.code;
  // Rate limits, timeouts, 503s, network errors
  return /429|503|timeout|DEADLINE_EXCEEDED|UNAVAILABLE|ECONNRESET|fetch failed/i.test(msg)
    || code === 429 || code === 503;
}

// ─── route handler ──────────────────────────────────────────────────────────

const MAX_RETRIES = 2;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  const { imageBase64, mimeType } = body;

  // Stage 1: Call Gemini AI with retry
  let rawText = '';
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Prescription] AI attempt ${attempt}/${MAX_RETRIES}, image size: ${Math.round(imageBase64.length / 1024)}KB`);

      const { ai } = await import('@/ai/genkit');

      const response = await ai.generate({
        prompt: [
          {
            media: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
          {
            text: `Esta é uma receita médica brasileira. Extraia os dados e retorne JSON puro (sem markdown, sem texto adicional).

CATÁLOGO DE PRODUTOS CONHECIDOS:
${CATALOG_BLOCK}

Para cada produto na receita, tente identificar o SKU correspondente no catálogo acima usando correspondência parcial e contexto:
- Ignore maiúsculas/minúsculas e acentos
- "Fusionner 7000", "Entourage 7000mg/60ml", "FL 7000" devem mapear para ELF-7000-60ML
- Concentrações e volumes são os principais identificadores (ex: 3500mg, 60ml, 30ml, 10mg strip)
- Se não houver correspondência razoável, defina catalogSku como null

Esquema de resposta:
{
  "patientName": "nome completo do paciente ou null",
  "patientDocument": "CPF somente dígitos (11 dígitos) ou null",
  "doctorName": "nome completo do médico ou null",
  "doctorCrm": "CRM com estado (ex: 12345/SP) ou null",
  "prescriptionDate": "data da receita no formato YYYY-MM-DD ou null",
  "products": [
    {
      "name": "nome ou descrição exata como aparece na receita",
      "catalogSku": "SKU do catálogo acima (ex: ELF-7000-60ML) ou null",
      "concentration": "concentração como aparece na receita ou null",
      "quantity": número inteiro ou null
    }
  ]
}
Retorne APENAS o JSON válido.`,
          },
        ],
      });

      rawText = response.text;
      lastError = null;
      break; // success — exit retry loop
    } catch (error) {
      lastError = error;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Prescription] AI attempt ${attempt} failed: ${errMsg}`);

      if (attempt < MAX_RETRIES && isRetryable(error)) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      break; // non-retryable or last attempt
    }
  }

  // Stage 1 failed entirely — return error with diagnosis hint
  if (lastError || !rawText) {
    const errMsg = lastError instanceof Error ? lastError.message : String(lastError ?? 'empty response');
    const errCode = (lastError as Record<string, unknown>)?.code ?? 'unknown';
    console.error('[Prescription] AI generation failed after retries:', errMsg, '| code:', errCode);

    const hint = /429|rate/i.test(errMsg) ? 'Limite de requisições atingido. Tente novamente em alguns segundos.'
      : /timeout|DEADLINE/i.test(errMsg) ? 'Tempo esgotado ao processar a receita. Tente com uma imagem menor.'
      : 'Extração falhou. Preencha os campos manualmente.';

    return NextResponse.json({ ...EMPTY_RESULT, _error: hint } satisfies PrescriptionExtraction, { status: 422 });
  }

  // Stage 2: Parse JSON from AI response
  const parsed = extractJson(rawText);
  if (!parsed) {
    console.error('[Prescription] JSON parse failed. Raw response (first 500 chars):', rawText.slice(0, 500));
    return NextResponse.json(
      { ...EMPTY_RESULT, _error: 'IA retornou resposta inválida. Tente novamente ou preencha manualmente.' } satisfies PrescriptionExtraction,
      { status: 422 },
    );
  }

  // Stage 3: Coerce into typed result (partial extraction is OK)
  const data = coerceExtraction(parsed);

  const filledFields = [data.patientName, data.patientDocument, data.doctorName, data.doctorCrm, data.prescriptionDate]
    .filter(Boolean).length;
  console.log(`[Prescription] Extracted ${filledFields} fields, ${data.products.length} products`);

  return NextResponse.json(data);
}
