'use server';

import {
  createZapSignDocument,
  ZapSignError,
  type CreateProcuracaoParams,
  type ZapSignDocType,
} from '@/server/integrations/zapsign';

type ZapSignResult = {
  docId: string;
  signUrl: string;
  signerToken: string;
  status: string;
  error?: string;
};

/**
 * Generic ZapSign document generator — handles all doc types.
 */
async function generateZapSignDoc(
  docType: ZapSignDocType,
  orderId: string,
  signerName: string,
  signerCpf: string,
  signerEmail: string | undefined,
  signerPhone: string | undefined,
  signerAddress: CreateProcuracaoParams['signerAddress'],
): Promise<ZapSignResult> {
  try {
    const result = await createZapSignDocument({
      orderId,
      signerName,
      signerCpf,
      signerEmail,
      signerPhone: signerPhone?.replace(/\D/g, '').replace(/^55/, '') || undefined,
      signerPhoneCountry: '55',
      signerAddress,
    }, docType);

    return {
      docId: result.docId,
      signUrl: result.signUrl,
      signerToken: result.signerToken,
      status: result.status,
    };
  } catch (err) {
    console.error(`[generate${docType}] Error:`, err);

    const message =
      err instanceof ZapSignError
        ? err.detail
          ? `${err.message}: ${err.detail}`
          : err.message
        : `Erro inesperado ao gerar documento ZapSign (${docType}).`;

    return { docId: '', signUrl: '', signerToken: '', status: 'error', error: message };
  }
}

/** Generate a procuração ANVISA document on ZapSign. */
export async function generateProcuracao(
  orderId: string,
  signerName: string,
  signerCpf: string,
  signerEmail: string | undefined,
  signerPhone: string | undefined,
  signerAddress: CreateProcuracaoParams['signerAddress'],
): Promise<ZapSignResult> {
  return generateZapSignDoc('procuracao', orderId, signerName, signerCpf, signerEmail, signerPhone, signerAddress);
}

/** Generate a Power of Attorney document on ZapSign. */
export async function generatePowerOfAttorney(
  orderId: string,
  signerName: string,
  signerCpf: string,
  signerEmail: string | undefined,
  signerPhone: string | undefined,
  signerAddress: CreateProcuracaoParams['signerAddress'],
): Promise<ZapSignResult> {
  return generateZapSignDoc('power_of_attorney', orderId, signerName, signerCpf, signerEmail, signerPhone, signerAddress);
}

/** Generate a Comprovante de Vínculo document on ZapSign. */
export async function generateComprovanteVinculo(
  orderId: string,
  signerName: string,
  signerCpf: string,
  signerEmail: string | undefined,
  signerPhone: string | undefined,
  signerAddress: CreateProcuracaoParams['signerAddress'],
): Promise<ZapSignResult> {
  return generateZapSignDoc('comprovante_vinculo', orderId, signerName, signerCpf, signerEmail, signerPhone, signerAddress);
}
