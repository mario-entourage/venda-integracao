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
    const input = body as ExtractOcrFieldsInput;
    console.log(`[OCR-API] Processing ${input.documentType}, contentType: ${input.contentType}, ocrText: ${input.ocrText ? `${input.ocrText.length} chars` : 'none'}`);
    const result = await extractOcrFields(input);
    return NextResponse.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const docType = (body as ExtractOcrFieldsInput)?.documentType ?? 'unknown';
    console.error(`[OCR-API] Failed for ${docType}: ${errMsg}`, error);

    // Return partial empty result instead of a generic error object,
    // so the frontend can still render the form with empty fields
    return NextResponse.json(
      {
        extractedFields: {},
        fieldConfidence: {},
        missingCriticalFields: [],
        _error: /429|rate/i.test(errMsg)
          ? 'Limite de requisições atingido. Tente novamente em alguns segundos.'
          : /timeout|DEADLINE/i.test(errMsg)
            ? 'Tempo esgotado ao processar documento. Tente novamente.'
            : `Falha na extração do ${docType === 'DOCUMENTO_PACIENTE' ? 'documento do paciente' : docType === 'COMPROVANTE_RESIDENCIA' ? 'comprovante de residência' : docType === 'RECEITA_MEDICA' ? 'receita médica' : 'documento'}. Preencha manualmente.`,
      },
      { status: 422 },
    );
  }
}
