/**
 * ZapSign API integration stub.
 *
 * ZapSign is a Brazilian electronic signature platform. This module handles
 * creating signature requests for order-related documents (e.g. ANVISA
 * authorisation forms, purchase agreements).
 *
 * TODO: Replace the stub with real HTTP calls using
 *       `process.env.ZAPSIGN_API_KEY` and the ZapSign REST API
 *       (https://docs.zapsign.com.br).
 */

export interface ZapSignDocumentResult {
  /** ZapSign document identifier. */
  docId: string;
  /** URL the signer visits to review & sign the document. */
  signUrl: string;
  /** Current signature status (e.g. "pending", "signed"). */
  status: string;
}

/**
 * Create a new document signature request on ZapSign.
 *
 * @param orderId       - The Entourage order ID this document belongs to.
 * @param customerName  - Full name of the signer / customer.
 * @param customerEmail - Optional e-mail; ZapSign can send a notification.
 */
export async function createZapSignDocument(
  orderId: string,
  customerName: string,
  customerEmail?: string,
): Promise<ZapSignDocumentResult> {
  // ---- Stub implementation --------------------------------------------------
  return {
    docId: `zs_${orderId.slice(0, 8)}`,
    signUrl: `https://app.zapsign.com.br/sign/${orderId.slice(0, 8)}`,
    status: 'pending',
  };
}
