'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const generateEmailFlow = ai.defineFlow(
  {
    name: 'generateEmail',
    inputSchema: z.object({
      templateType: z.string().describe('Email template type (e.g., order_confirmation, payment_reminder)'),
      context: z.record(z.string()).describe('Template context variables'),
    }),
    outputSchema: z.object({
      subject: z.string(),
      body: z.string(),
    }),
  },
  async (input) => {
    // TODO: Implement email generation with Gemini
    return { subject: '', body: '' };
  }
);
