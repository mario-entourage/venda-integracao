/**
 * GlobalPay API integration.
 *
 * Two-step flow:
 *   1. POST /v1/token  — exchange the pubKey for a short-lived bearer token.
 *   2. POST /v1/transaction — create a payment link using that token.
 *
 * Documentation: https://tryglobalpays.com/developers/api-reference-payment-link
 *
 * Environment variables:
 *   GLOBALPAY_API_URL    — base URL (default: sandbox)
 *   GLOBALPAY_PUB_KEY    — merchant public key for token generation
 *   GLOBALPAYS_MERCHANT_CODE — merchant code (default: "4912")
 */

// ─── types ───────────────────────────────────────────────────────────────────

export interface GlobalPayLinkRequest {
  /** Total amount in the currency's major unit (e.g. 199.99 = $199.99 USD). */
  amount: number;
  /** ISO 4217 currency code (e.g. "BRL", "USD"). */
  currency: string;
  /** Merchant identifier provided by GlobalPay. */
  merchantCode: string;
  /** Internal reference ID to correlate with the Entourage order. */
  referenceId: string;
  /** URL to redirect the customer after payment completes. */
  callbackUrl: string;
  /** Optional description shown on the checkout page. */
  description?: string;
  /** Customer name (for GlobalPay's customer record). */
  customerName?: string;
  /** Customer email. */
  customerEmail?: string;
  /** Customer document (CPF/CNPJ). */
  customerDocument?: string;
  /** Customer phone. */
  customerPhone?: string;
}

export interface GlobalPayLinkResponse {
  /** URL the customer visits to complete payment. */
  paymentUrl: string;
  /** Echo of the internal reference. */
  referenceId: string;
  /** GlobalPay's own order ID for the transaction. */
  gpOrderId: string;
  /** Current status as reported by GlobalPay. */
  status: string;
}

/** Parsed error from the GlobalPay API. */
export class GlobalPayError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public statusType: string,
  ) {
    super(message);
    this.name = 'GlobalPayError';
  }
}

// ─── token cache ─────────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  /** Epoch-ms when this token should be considered expired. */
  expiresAt: number;
}

/** Module-level token cache. Tokens are refreshed 60 s before their lifetime. */
let tokenCache: CachedToken | null = null;

/** Token lifetime — assume 55 minutes to be safe (re-fetch before real expiry). */
const TOKEN_LIFETIME_MS = 55 * 60 * 1000;

// ─── helpers ─────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return (
    process.env.GLOBALPAY_API_URL ||
    'https://apihml.tryglobalpays.com/v1' // sandbox default
  );
}

function getPubKey(): string {
  const key = process.env.GLOBALPAY_PUB_KEY;
  if (!key) {
    throw new GlobalPayError(
      'GLOBALPAY_PUB_KEY is not configured. Set it in apphosting.yaml or .env.local.',
      0,
      'config_error',
    );
  }
  return key;
}

// ─── API calls ───────────────────────────────────────────────────────────────

/**
 * Obtain a bearer token from GlobalPay by exchanging the merchant's pubKey.
 *
 * POST {baseUrl}/token
 * Body: { pubKey }
 * Response: { statusCode: 200, data: "<token_string>" }
 */
async function fetchToken(): Promise<string> {
  const baseUrl = getBaseUrl();
  const pubKey = getPubKey();

  const res = await fetch(`${baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubKey }),
  });

  const json = await res.json();

  if (!res.ok || (json.statusCode && json.statusCode !== 200)) {
    throw new GlobalPayError(
      `Token request failed: ${json.message || json.statusType || res.statusText}`,
      json.statusCode || res.status,
      json.statusType || 'token_error',
    );
  }

  // The API returns the token in `data` (a string)
  const token = typeof json.data === 'string' ? json.data : json.token || json.data?.token;
  if (!token) {
    throw new GlobalPayError(
      'Token response did not include a token value.',
      0,
      'parse_error',
    );
  }

  return token;
}

/**
 * Get a valid GlobalPay token, using the in-memory cache when possible.
 */
async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const token = await fetchToken();
  tokenCache = {
    token,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
  };
  return token;
}

/**
 * Error-code to human-readable message mapping.
 */
const GP_ERROR_MESSAGES: Record<number, string> = {
  300: 'Chave pública (pubKey) não informada.',
  310: 'Código do lojista (merchantCode) não informado.',
  340: 'Valor (amount) deve ser maior ou igual a 1.',
  350: 'URL de callback não informada.',
  400: 'Pedido não encontrado no GlobalPay.',
  410: 'Token inválido. Será renovado automaticamente.',
  420: 'Token expirado. Será renovado automaticamente.',
  500: 'Erro interno do servidor GlobalPay. Tente novamente.',
};

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Request a new payment link from the GlobalPay API.
 *
 * POST {baseUrl}/transaction
 * Header: token: <bearer>
 * Body: { amount, merchantCode, pubKey, callback, description?, ... }
 * Response: { statusCode: 200, data: { url, orderId } }
 */
export async function createGlobalPayLink(
  request: GlobalPayLinkRequest,
): Promise<GlobalPayLinkResponse> {
  const baseUrl = getBaseUrl();
  const pubKey = getPubKey();
  const merchantCode = request.merchantCode;

  // Build the request body
  const body: Record<string, unknown> = {
    amount: request.amount,
    merchantCode,
    pubKey,
    callback: request.callbackUrl,
  };

  if (request.description) body.description = request.description;
  if (request.customerName) body.name = request.customerName;
  if (request.customerEmail) body.email = request.customerEmail;
  if (request.customerDocument) body.document = request.customerDocument;
  if (request.customerPhone) body.phone = request.customerPhone;

  // Attempt with auto-retry on expired/invalid token (once)
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken();

    const res = await fetch(`${baseUrl}/transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    // Token expired or invalid — clear cache and retry
    if (json.statusCode === 410 || json.statusCode === 420) {
      tokenCache = null;
      if (attempt === 0) continue; // retry once
    }

    if (!res.ok || (json.statusCode && json.statusCode !== 200)) {
      const friendlyMsg =
        GP_ERROR_MESSAGES[json.statusCode] ||
        json.message ||
        json.statusType ||
        res.statusText;
      throw new GlobalPayError(
        `GlobalPay transaction failed: ${friendlyMsg}`,
        json.statusCode || res.status,
        json.statusType || 'transaction_error',
      );
    }

    // Success — extract url and orderId from response
    const paymentUrl = json.data?.url || json.data?.paymentUrl || '';
    const gpOrderId = String(json.data?.orderId || json.data?.id || '');

    if (!paymentUrl) {
      throw new GlobalPayError(
        'GlobalPay response did not include a payment URL.',
        0,
        'parse_error',
      );
    }

    return {
      paymentUrl,
      referenceId: request.referenceId,
      gpOrderId,
      status: 'created',
    };
  }

  // Should never reach here, but TS needs a return
  throw new GlobalPayError('Token refresh failed after retry.', 420, 'token_error');
}

// ─── query / cancel (for future use) ─────────────────────────────────────────

/**
 * Query a transaction status from GlobalPay.
 *
 * GET {baseUrl}/transaction/{gpOrderId}
 */
export async function getGlobalPayTransaction(
  gpOrderId: string,
): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl();
  const token = await getToken();

  const res = await fetch(`${baseUrl}/transaction/${gpOrderId}`, {
    method: 'GET',
    headers: { token },
  });

  const json = await res.json();

  if (!res.ok || (json.statusCode && json.statusCode !== 200)) {
    throw new GlobalPayError(
      `Query failed: ${json.message || res.statusText}`,
      json.statusCode || res.status,
      json.statusType || 'query_error',
    );
  }

  return json.data || json;
}

/**
 * Cancel / deactivate a transaction on GlobalPay.
 *
 * POST {baseUrl}/transaction/{gpOrderId}/cancel
 */
export async function cancelGlobalPayTransaction(
  gpOrderId: string,
): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = await getToken();

  const res = await fetch(`${baseUrl}/transaction/${gpOrderId}/cancel`, {
    method: 'POST',
    headers: { token },
  });

  const json = await res.json();

  if (!res.ok || (json.statusCode && json.statusCode !== 200)) {
    throw new GlobalPayError(
      `Cancellation failed: ${json.message || res.statusText}`,
      json.statusCode || res.status,
      json.statusType || 'cancel_error',
    );
  }
}
