'use server';

import {
  createZapSignDocument,
  ZapSignError,
  type CreateProcuracaoParams,
} from '@/server/integrations/zapsign';

/**
 * Generate a procuração document on ZapSign for electronic signing.
 *
 * Called from StepDocumentacao when all required documents are received.
 * Firestore persistence of the result is done client-side via updateOrder().
 */
export async function generateProcuracao(
  orderId: string,
  signerName: string,
  signerCpf: string,
  signerEmail: string | undefined,
  signerPhone: string | undefined,
  signerAddress: CreateProcuracaoParams['signerAddress'],
): Promise<{
  docId: string;
  signUrl: string;
  signerToken: string;
  status: string;
  error?: string;
}> {
  try {
    const result = await createZapSignDocument({
      orderId,
      signerName,
      signerCpf,
      signerEmail,
      // Strip non-digits and leading country code for ZapSign
      signerPhone: signerPhone?.replace(/\D/g, '').replace(/^55/, '') || undefined,
      signerPhoneCountry: '55',
      signerAddress,
    });

    return {
      docId: result.docId,
      signUrl: result.signUrl,
      signerToken: result.signerToken,
      status: result.status,
    };
  } catch (err) {
    console.error('[generateProcuracao] Error:', err);

    const message =
      err instanceof ZapSignError
        ? err.message
        : 'Erro inesperado ao gerar procuração.';

    return {
      docId: '',
      signUrl: '',
      signerToken: '',
      status: 'error',
      error: message,
    };
  }
}
