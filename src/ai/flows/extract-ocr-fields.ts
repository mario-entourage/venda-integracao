'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const extractOcrFieldsFlow = ai.defineFlow(
  {
    name: 'extractOcrFields',
    inputSchema: z.object({
      imageBase64: z.string().describe('Base64-encoded document image'),
      documentType: z.string().describe('Type of document to extract fields from'),
    }),
    outputSchema: z.object({
      fields: z.record(z.string()).describe('Extracted field key-value pairs'),
    }),
  },
  async (input) => {
    // TODO: Implement OCR field extraction with Gemini vision (replaces AWS Textract)
    return { fields: {} };
  }
);
