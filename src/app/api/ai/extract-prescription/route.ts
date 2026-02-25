import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS_CATALOG } from '@/data/products-catalog';

export const dynamic = 'force-dynamic';

export interface PrescriptionExtraction {
  patientName: string | null;
  patientDocument: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
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

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

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

    // Robustly extract JSON from the response (handles markdown code blocks)
    const rawText = response.text;
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No JSON found in AI response');
    }

    const data: PrescriptionExtraction = JSON.parse(rawText.slice(jsonStart, jsonEnd));
    return NextResponse.json(data);
  } catch (error) {
    // Log full error details to Cloud Run / App Hosting logs for diagnosis
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = (error as Record<string, unknown>)?.code ?? 'unknown';
    console.error('Prescription extraction error:', errMsg, '| code:', errCode, '| full:', error);

    return NextResponse.json(
      {
        patientName: null,
        patientDocument: null,
        doctorName: null,
        doctorCrm: null,
        products: [],
        _error: 'Extração falhou. Preencha os campos manualmente.',
      } satisfies PrescriptionExtraction,
      { status: 200 },
    );
  }
}
