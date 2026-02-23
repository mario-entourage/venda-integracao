'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const classifyDocumentFlow = ai.defineFlow(
  {
    name: 'classifyDocument',
    inputSchema: z.object({
      imageBase64: z.string().describe('Base64-encoded document image'),
    }),
    outputSchema: z.object({
      documentType: z.string().describe('Classified document type'),
      confidence: z.number().describe('Confidence score 0-1'),
    }),
  },
  async (input) => {
    // TODO: Implement document classification with Gemini vision
    return { documentType: 'unknown', confidence: 0 };
  }
);
