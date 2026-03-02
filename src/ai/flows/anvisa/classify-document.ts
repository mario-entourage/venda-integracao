'use server';

/**
 * Uses Gemini's vision capabilities to classify a document as one of the
 * required Brazilian document types for ANVISA requests.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// ─── Schemas ────────────────────────────────────────────────────────────────

const ClassifyDocumentInputSchema = z.object({
  fileDataUrl: z.string()
    .describe('Base64 data URL of the document file (e.g., data:image/jpeg;base64,...).'),
  contentType: z.string()
    .describe('The MIME type of the file (e.g., image/jpeg, application/pdf).'),
  fileName: z.string()
    .describe('Original file name, which may contain hints about the document type.'),
});
export type ClassifyDocumentInput = z.infer<typeof ClassifyDocumentInputSchema>;

const ClassifyDocumentOutputSchema = z.object({
  documentType: z.enum(['DOCUMENTO_PACIENTE', 'COMPROVANTE_RESIDENCIA', 'RECEITA_MEDICA', 'OUTRO'])
    .describe('The classified document type.'),
  confidence: z.number().min(0).max(1)
    .describe('Classification confidence from 0.0 to 1.0.'),
  reasoning: z.string()
    .describe('Brief explanation of why this classification was chosen.'),
});
export type ClassifyDocumentOutput = z.infer<typeof ClassifyDocumentOutputSchema>;

// ─── System prompt ──────────────────────────────────────────────────────────

const systemPrompt = `You are a Brazilian document classifier for an ANVISA (Brazilian Health Regulatory Agency) application.
You will be shown a document image or PDF. Your task is to classify it into one of these categories:

1. **DOCUMENTO_PACIENTE** — Patient identity document
   Visual cues:
   - Brazilian ID card (RG / Registro Geral): front has photo, name, filiation; back has fingerprint, RG number, date of birth
   - Brazilian driver's license (CNH / Carteira Nacional de Habilitacao): laminated card with photo, categories, CPF
   - Passport: cover page or data page with photo
   - Any government-issued photo identification
   Key indicators: photo of a person, "REGISTRO GERAL", "CARTEIRA DE IDENTIDADE", "CNH", "REPUBLICA FEDERATIVA DO BRASIL", fingerprint section, date of birth, RG number

2. **COMPROVANTE_RESIDENCIA** — Proof of residency
   Visual cues:
   - Utility bills (electricity, water, gas, internet, phone)
   - Bank statements
   - Credit card bills
   - Property tax bills (IPTU)
   Key indicators: company logo (CEMIG, COPASA, COPEL, Enel, Vivo, NET, etc.), barcode/boleto, billing period, "conta de energia", "conta de agua", "fatura", full street address with number, city, state, CEP (postal code), monthly charges

3. **RECEITA_MEDICA** — Medical prescription
   Visual cues:
   - Doctor's prescription pad or hospital letterhead
   - Handwritten or typed medication names and dosages
   - Doctor's stamp with CRM number
   - Clinic or hospital logo
   Key indicators: "Receita", "Rx", CRM number, medication names, dosage instructions ("tomar", "mg", "comprimidos"), doctor's signature, doctor's stamp, hospital/clinic header

4. **OUTRO** — None of the above
   Use this ONLY if the document clearly does not fit any of the three categories above.

CLASSIFICATION RULES:
- Look at the OVERALL structure and visual layout of the document, not just individual text fragments.
- If the document shows BOTH sides of an ID card (front and back), classify as DOCUMENTO_PACIENTE.
- If a document is a photocopy or scanned copy of an ID, it is still DOCUMENTO_PACIENTE.
- If unsure between two types, choose the more likely one and reflect the uncertainty in the confidence score.
- NEVER classify a document as OUTRO if it reasonably matches one of the three types.
- Confidence should be 0.9+ for clear, obvious matches; 0.7-0.9 for likely matches; below 0.7 for uncertain.`;

// ─── Main function ──────────────────────────────────────────────────────────

export async function classifyDocument(input: ClassifyDocumentInput): Promise<ClassifyDocumentOutput> {
  const promptParts = [
    { media: { url: input.fileDataUrl, contentType: input.contentType } },
    {
      text: `Classify this document. The file name is: "${input.fileName}". Determine whether it is a patient identity document (DOCUMENTO_PACIENTE), proof of residency (COMPROVANTE_RESIDENCIA), medical prescription (RECEITA_MEDICA), or none of these (OUTRO).`,
    },
  ];

  const { output } = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    system: systemPrompt,
    prompt: promptParts as any,
    output: { schema: ClassifyDocumentOutputSchema },
  });

  return output!;
}
