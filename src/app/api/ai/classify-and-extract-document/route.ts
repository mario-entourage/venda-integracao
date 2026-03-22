import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

export const dynamic = 'force-dynamic';

export type DocumentClassification =
  | 'identity'
  | 'proof_of_address'
  | 'prescription'
  | 'anvisa_authorization'
  | 'other';

export interface ClassifyAndExtractResponse {
  documentType: DocumentClassification;
  confidence: number;
  /** Fields extracted from the document. Only populated fields will be non-null. */
  extractedData: {
    // identity (RG / CNH)
    fullName: string | null;
    rg: string | null;
    cpf: string | null;
    birthDate: string | null; // YYYY-MM-DD
    // proof of address
    postalCode: string | null;
    street: string | null;
    streetNumber: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null; // 2-letter UF
    // prescription header (doctor info)
    doctorName: string | null;
    doctorCrm: string | null;
    doctorSpecialty: string | null;
    doctorState: string | null;
    doctorCity: string | null;
    doctorPhone: string | null;
    doctorMobilePhone: string | null;
    doctorEmail: string | null;
  };
  _error?: string;
}

const EMPTY_DATA: ClassifyAndExtractResponse['extractedData'] = {
  fullName: null, rg: null, cpf: null, birthDate: null,
  postalCode: null, street: null, streetNumber: null, complement: null,
  neighborhood: null, city: null, state: null,
  doctorName: null, doctorCrm: null, doctorSpecialty: null,
  doctorState: null, doctorCity: null, doctorPhone: null,
  doctorMobilePhone: null, doctorEmail: null,
};

const BodySchema = z.object({
  imageBase64: z.string().min(1, 'imageBase64 is required'),
  mimeType: z.string().optional().default('image/jpeg'),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  try {
    const { imageBase64, mimeType } = body;

    const { ai } = await import('@/ai/genkit');

    const response = await ai.generate({
      prompt: [
        { media: { url: `data:${mimeType};base64,${imageBase64}` } },
        {
          text: `Analise este documento brasileiro e responda APENAS em JSON puro (sem markdown):
{
  "documentType": "identity" | "proof_of_address" | "prescription" | "anvisa_authorization" | "other",
  "confidence": número de 0.0 a 1.0,
  "extractedData": {
    "fullName": "nome completo ou null",
    "rg": "número do RG (formato xx.xxx.xxx-x) ou null",
    "cpf": "CPF somente dígitos (11) ou null",
    "birthDate": "data nascimento YYYY-MM-DD ou null",
    "postalCode": "CEP somente dígitos (8) ou null",
    "street": "logradouro ou null",
    "streetNumber": "número do endereço ou null",
    "complement": "complemento ou null",
    "neighborhood": "bairro ou null",
    "city": "cidade ou null",
    "state": "UF 2 letras maiúsculas ou null",
    "doctorName": "nome completo do médico ou null",
    "doctorCrm": "CRM com estado (ex: 12345/SP) ou null",
    "doctorSpecialty": "especialidade médica ou null",
    "doctorState": "UF do consultório ou null",
    "doctorCity": "município do consultório ou null",
    "doctorPhone": "telefone fixo do consultório ou null",
    "doctorMobilePhone": "celular do médico ou null",
    "doctorEmail": "email do médico ou null"
  }
}

Regras:
- documentType "identity" = RG, CNH, ou qualquer documento de identidade com foto
- documentType "proof_of_address" = conta de água/luz/gás, extrato bancário, correspondência com endereço
- documentType "prescription" = receita médica
- documentType "anvisa_authorization" = autorização ou procuração ANVISA
- Para campos não visíveis no documento, use null
- Retorne APENAS o JSON, sem texto adicional`,
        },
      ],
    });

    const rawText = response.text;
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === 0) throw new Error('No JSON in response');

    const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd));

    const result: ClassifyAndExtractResponse = {
      documentType: parsed.documentType ?? 'other',
      confidence: parsed.confidence ?? 0,
      extractedData: { ...EMPTY_DATA, ...(parsed.extractedData ?? {}) },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Document classification error:', error);
    return NextResponse.json({
      documentType: 'other' as DocumentClassification,
      confidence: 0,
      extractedData: EMPTY_DATA,
      _error: 'Falha ao classificar documento. Tente novamente.',
    } satisfies ClassifyAndExtractResponse, { status: 500 });
  }
}
