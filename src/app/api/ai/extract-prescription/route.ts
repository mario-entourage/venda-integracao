import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface PrescriptionExtraction {
  patientName: string | null;
  patientDocument: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  products: Array<{
    name: string;
    concentration: string | null;
    quantity: number | null;
  }>;
  _error?: string;
}

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
          text: `Esta é uma receita médica brasileira. Extraia as seguintes informações em JSON puro (sem markdown, sem texto adicional):
{
  "patientName": "nome completo do paciente ou null",
  "patientDocument": "CPF somente dígitos (11 dígitos) ou null",
  "doctorName": "nome completo do médico ou null",
  "doctorCrm": "CRM com estado (ex: 12345/SP) ou null",
  "products": [
    { "name": "nome do produto ou fórmula", "concentration": "concentração (ex: 10mg/mL) ou null", "quantity": número inteiro ou null }
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
