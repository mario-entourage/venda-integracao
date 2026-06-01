/**
 * GlobalPay API integration.
 *
 * Two-step flow:
 *   1. POST /v1/paymentapi/auth        — exchange pubKey + merchantCode for a JWT.
 *   2. POST /v1/paymentapi/order       — create a payment link using that JWT.
 *
 * Documentation: https://tryglobalpays.com/developers/api-reference-payment-link
 *
 * Key facts discovered through API probing:
 *   - Auth endpoint:    POST {base}/paymentapi/auth
 *   - Order endpoint:   POST {base}/paymentapi/order
 *   - Auth header:      Authorization: Bearer <token>  (NOT "token: <value>")
 *   - Success code:     statusCode === 1               (NOT 200)
 *   - Token field:      json.token                     (NOT json.data)
 *   - Credentials only work on production (api.tryglobalpays.com)
 *
 * Environment variables:
 *   GLOBALPAY_API_URL         — base URL (defaults to production)
 *   GLOBALPAY_PUB_KEY         — merchant public key
 *   GLOBALPAYS_MERCHANT_CODE  — merchant code (default: "4912")
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
  /** Allowed payment methods (e.g. ['credit_card', 'pix']). If omitted, all methods enabled. */
  paymentMethods?: string[];
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

/** Module-level token cache. Cleared on auth errors to force a fresh fetch. */
let tokenCache: CachedToken | null = null;

// ─── helpers ─────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return (
    process.env.GLOBALPAY_API_URL ||
    'https://api.tryglobalpays.com/v1' // production default (sandbox rejects these creds)
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

/** Parse the `expirate` string ("2026-02-26 15:52:19") into an epoch-ms timestamp. */
function parseExpiry(expirate: string): number {
  const ms = Date.parse(expirate.replace(' ', 'T'));
  // Subtract 60 s so we refresh before the token actually expires
  return isNaN(ms) ? Date.now() + 55 * 60 * 1000 : ms - 60_000;
}

// ─── API calls ───────────────────────────────────────────────────────────────

/**
 * Obtain a JWT from GlobalPay by exchanging the merchant's pubKey + merchantCode.
 *
 * POST {baseUrl}/paymentapi/auth
 * Body:     { pubKey, merchantCode }
 * Response: { statusCode: 1, statusType: "success", expirate: "...", token: "..." }
 */
async function fetchToken(): Promise<string> {
  const baseUrl = getBaseUrl();
  const pubKey = getPubKey();
  const merchantCode = process.env.GLOBALPAYS_MERCHANT_CODE || '4912';

  const res = await fetch(`${baseUrl}/paymentapi/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubKey, merchantCode }),
  });

  const json = await res.json();

  // Success is statusCode === 1
  if (json.statusCode !== 1) {
    throw new GlobalPayError(
      `Token request failed: ${json.msg || json.statusType || res.statusText}`,
      json.statusCode ?? res.status,
      json.statusType || 'token_error',
    );
  }

  const token = json.token as string | undefined;
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
 * Get a valid GlobalPay JWT, using the in-memory cache when possible.
 */
async function getToken(): Promise<{ token: string; expiresAt: number }> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache;
  }

  const baseUrl = getBaseUrl();
  const pubKey = getPubKey();
  const merchantCode = process.env.GLOBALPAYS_MERCHANT_CODE || '4912';

  const res = await fetch(`${baseUrl}/paymentapi/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubKey, merchantCode }),
  });

  const json = await res.json();

  if (json.statusCode !== 1) {
    throw new GlobalPayError(
      `Token request failed: ${json.msg || json.statusType || res.statusText}`,
      json.statusCode ?? res.status,
      json.statusType || 'token_error',
    );
  }

  const token = json.token as string;
  if (!token) {
    throw new GlobalPayError('Token response did not include a token value.', 0, 'parse_error');
  }

  const expiresAt = parseExpiry(json.expirate || '');
  tokenCache = { token, expiresAt };
  return tokenCache;
}

/**
 * Error-code to human-readable message mapping.
 */
const GP_ERROR_MESSAGES: Record<number, string> = {
  300: 'Chave pública (pubKey) não informada.',
  310: 'Código do lojista (merchantCode) não informado.',
  320: 'Credenciais inválidas.',
  340: 'Valor (amount) deve ser maior ou igual a 1.',
  350: 'URL de callback não informada.',
  400: 'Pedido não encontrado no GlobalPay.',
  401: 'Token inválido ou expirado.',
  500: 'Erro interno do servidor GlobalPay. Tente novamente.',
};

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Request a new payment link from the GlobalPay API.
 *
 * POST {baseUrl}/paymentapi/order
 * Header: Authorization: Bearer <jwt>
 * Body:   { amount, merchantCode, pubKey, callback, ... }
 * Response: { statusCode: 1, data: { orderId, authCode, url } }
 */
export async function createGlobalPayLink(
  request: GlobalPayLinkRequest,
): Promise<GlobalPayLinkResponse> {
  const pubKey = getPubKey();
  const merchantCode = request.merchantCode;
  const baseUrl = getBaseUrl();

  // Build client sub-object (all fields optional per docs)
  const client: Record<string, string> = {};
  if (request.customerName)     client.name  = request.customerName;
  if (request.customerEmail)    client.email = request.customerEmail;
  if (request.customerPhone)    client.phone = request.customerPhone;
  if (request.customerDocument) client.doc   = request.customerDocument;

  const body: Record<string, unknown> = {
    amount:      request.amount,
    currency:    request.currency || 'USD',
    merchantCode,
    pubKey,
    invoice:     request.referenceId,
    callback:    request.callbackUrl,
  };

  if (request.description)          body.description    = request.description;
  if (Object.keys(client).length)   body.client         = client;
  if (request.paymentMethods?.length) body.paymentMethods = request.paymentMethods;

  // Auto-retry once on auth error to handle stale cached token
  for (let attempt = 0; attempt < 2; attempt++) {
    const { token } = await getToken();

    const res = await fetch(`${baseUrl}/paymentapi/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    // Auth error — clear cache and retry once
    if ((json.cod === '401' || json.statusCode === 401) && attempt === 0) {
      tokenCache = null;
      continue;
    }

    if (json.statusCode !== 1) {
      const friendlyMsg =
        GP_ERROR_MESSAGES[json.statusCode] ||
        json.msg ||
        json.statusType ||
        res.statusText;
      throw new GlobalPayError(
        `GlobalPay order failed: ${friendlyMsg}`,
        json.statusCode ?? res.status,
        json.statusType || 'order_error',
      );
    }

    const paymentUrl = json.data?.url || '';
    const gpOrderId = String(json.data?.orderId || '');

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

  throw new GlobalPayError('Token refresh failed after retry.', 401, 'token_error');
}

// ─── query / cancel (for future use) ─────────────────────────────────────────

/**
 * Query a transaction status from GlobalPay.
 * GET {baseUrl}/paymentapi/order/{gpOrderId}
 *
 * Includes auto-retry on 401 (expired token) — mirrors createGlobalPayLink.
 */
export async function getGlobalPayTransaction(
  gpOrderId: string,
): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { token } = await getToken();

    const res = await fetch(`${baseUrl}/paymentapi/order/${gpOrderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const json = await res.json();

    // Auth error — clear cache and retry once
    if ((json.cod === '401' || json.statusCode === 401) && attempt === 0) {
      tokenCache = null;
      continue;
    }

    if (json.statusCode !== 1) {
      throw new GlobalPayError(
        `Query failed: ${json.msg || res.statusText}`,
        json.statusCode ?? res.status,
        json.statusType || 'query_error',
      );
    }

    return json.data || json;
  }

  throw new GlobalPayError('Token refresh failed after retry.', 401, 'token_error');
}

/**
 * Cancel / deactivate a transaction on GlobalPay.
 * POST {baseUrl}/paymentapi/order/{gpOrderId}/cancel
 *
 * Includes auto-retry on 401 (expired token).
 */
export async function cancelGlobalPayTransaction(gpOrderId: string): Promise<void> {
  const baseUrl = getBaseUrl();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { token } = await getToken();

    const res = await fetch(`${baseUrl}/paymentapi/order/${gpOrderId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const json = await res.json();

    // Auth error — clear cache and retry once
    if ((json.cod === '401' || json.statusCode === 401) && attempt === 0) {
      tokenCache = null;
      continue;
    }

    if (json.statusCode !== 1) {
      throw new GlobalPayError(
        `Cancellation failed: ${json.msg || res.statusText}`,
        json.statusCode ?? res.status,
        json.statusType || 'cancel_error',
      );
    }

    return;
  }

  throw new GlobalPayError('Token refresh failed after retry.', 401, 'token_error');
}
