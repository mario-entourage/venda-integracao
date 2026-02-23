/**
 * GlobalPay API integration stub.
 *
 * Generates payment links that can be sent to customers. The actual HTTP
 * call to the GlobalPay REST API should replace the placeholder
 * implementation below once the sandbox / production credentials are ready.
 */

export interface GlobalPayLinkRequest {
  /** Total amount in the smallest currency unit (e.g. cents). */
  amount: number;
  /** ISO 4217 currency code (e.g. "BRL", "USD"). */
  currency: string;
  /** Merchant identifier provided by GlobalPay. */
  merchantCode: string;
  /** Internal reference ID to correlate with the Entourage order. */
  referenceId: string;
  /** How many hours before the payment link expires. */
  expiresInHours: number;
}

export interface GlobalPayLinkResponse {
  /** URL the customer visits to complete payment. */
  paymentUrl: string;
  /** Echo of the internal reference. */
  referenceId: string;
  /** GlobalPay's own identifier for the link / transaction. */
  gpId: string;
  /** Current status as reported by GlobalPay. */
  status: string;
}

/**
 * Request a new payment link from the GlobalPay API.
 *
 * TODO: Replace the stub with a real HTTP request using
 *       `process.env.GLOBALPAY_API_KEY` and the appropriate base URL
 *       (`process.env.GLOBALPAY_API_URL`).
 */
export async function createGlobalPayLink(
  request: GlobalPayLinkRequest,
): Promise<GlobalPayLinkResponse> {
  // ---- Stub implementation --------------------------------------------------
  const gpId = `GP_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  return {
    paymentUrl: `https://globalpay.com/pay/entourage-${request.referenceId.slice(0, 8)}`,
    referenceId: request.referenceId,
    gpId,
    status: 'created',
  };
}
