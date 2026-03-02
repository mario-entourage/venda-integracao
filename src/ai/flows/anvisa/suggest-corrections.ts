'use server';

/**
 * Uses AI to suggest corrections for fields with low confidence
 * or that are likely to be incorrect after OCR.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// ─── Schemas ────────────────────────────────────────────────────────────────

const SuggestCorrectionsInputSchema = z.object({
  extractedData: z.record(z.string()).describe('The extracted data from OCR.'),
  confidenceScores: z.record(z.number()).describe('The confidence scores for each extracted field.'),
  missingFields: z.array(z.string()).describe('A list of fields that are missing.'),
});
export type SuggestCorrectionsInput = z.infer<typeof SuggestCorrectionsInputSchema>;

const SuggestCorrectionsOutputSchema = z
  .record(z.string())
  .describe('Suggested corrections for the extracted data.');
export type SuggestCorrectionsOutput = z.infer<typeof SuggestCorrectionsOutputSchema>;

// ─── Prompt + Flow ──────────────────────────────────────────────────────────

export async function suggestCorrections(
  input: SuggestCorrectionsInput,
): Promise<SuggestCorrectionsOutput> {
  return suggestCorrectionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestCorrectionsPrompt',
  input: { schema: SuggestCorrectionsInputSchema },
  output: { schema: SuggestCorrectionsOutputSchema },
  prompt: `You are an AI assistant that suggests corrections for OCR extracted data from Brazilian medical documents (ANVISA prescription import process).

You are given the extracted data, confidence scores for each field, and a list of missing fields.

CRITICAL RULES:
- ONLY suggest a correction when you can derive the correct value from the existing extracted data (e.g., fixing an obvious OCR misread, reformatting a date, normalizing a CPF).
- NEVER invent, fabricate, or guess values. If you cannot determine the correct value from the provided data, do NOT include that field in the output.
- NEVER use placeholder or example values like "12345-678", "000.000.000-00", "João da Silva", etc.
- For CEP: only suggest if you can derive it from an address in the extracted data.
- For dates: only fix formatting issues (e.g., "01-02-2024" → "01/02/2024").
- For CPF: only fix formatting (e.g., "12345678901" → "123.456.789-01").
- For UF: only suggest if you can identify the state from extracted data (e.g., CRM number format, address).
- Return an EMPTY JSON object if no corrections can be confidently derived.

Extracted Data: {{{extractedData}}}
Confidence Scores: {{{confidenceScores}}}
Missing Fields: {{{missingFields}}}

Return ONLY fields where you have a confident correction based on the extracted data. JSON format.
`,
});

const suggestCorrectionsFlow = ai.defineFlow(
  {
    name: 'suggestCorrectionsFlow',
    inputSchema: SuggestCorrectionsInputSchema,
    outputSchema: SuggestCorrectionsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  },
);
