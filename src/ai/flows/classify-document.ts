'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const VALID_TYPES = [
  'prescription',
  'identity',
  'proof_of_address',
  'medical_report',
  'invoice',
  'anvisa_authorization',
  'general',
] as const;

export const classifyDocumentFlow = ai.defineFlow(
  {
    name: 'classifyDocument',
    inputSchema: z.object({
      imageBase64: z.string().describe('Base64-encoded document image'),
      mimeType: z.string().optional().describe('MIME type of the image'),
    }),
    outputSchema: z.object({
      documentType: z.string().describe('Classified document type'),
      confidence: z.number().describe('Confidence score 0-1'),
    }),
  },
  async (input) => {
    const mimeType = input.mimeType || 'image/jpeg';

    const response = await ai.generate({
      prompt: [
        {
          media: {
            url: `data:${mimeType};base64,${input.imageBase64}`,
          },
        },
        {
          text: `Classifique este documento brasileiro. Retorne APENAS JSON puro (sem markdown, sem texto adicional).

Tipos possíveis:
- "prescription" — Receita médica ou prescrição
- "identity" — Documento de identidade (RG, CNH, passaporte)
- "proof_of_address" — Comprovante de endereço (conta de luz, água, telefone, etc.)
- "medical_report" — Laudo médico ou relatório médico
- "invoice" — Nota fiscal
- "anvisa_authorization" — Autorização ANVISA de importação
- "general" — Outro documento que não se encaixa nas categorias acima

Esquema de resposta:
{
  "documentType": "um dos tipos acima",
  "confidence": 0.0 a 1.0
}

Retorne APENAS o JSON válido.`,
        },
      ],
    });

    const rawText = response.text;
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
      return { documentType: 'general', confidence: 0 };
    }

    try {
      const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd));
      const docType = VALID_TYPES.includes(parsed.documentType) ? parsed.documentType : 'general';
      return {
        documentType: docType,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch {
      return { documentType: 'general', confidence: 0 };
    }
  }
);
