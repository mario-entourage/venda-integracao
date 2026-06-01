/**
 * Minimal GlobalPay client for Cloud Functions.
 *
 * Duplicates just the auth + query logic from the Next.js integration
 * because Cloud Functions run in a separate Node.js runtime.
 */

import { logger } from 'firebase-functions/v1';
import { defineSecret } from 'firebase-functions/params';

export const GLOBALPAY_API_URL = defineSecret('GLOBALPAY_API_URL');
export const GLOBALPAY_PUB_KEY = defineSecret('GLOBALPAY_PUB_KEY');
export const GLOBALPAYS_MERCHANT_CODE = defineSecret('GLOBALPAYS_MERCHANT_CODE');

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function authenticate(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const baseUrl = GLOBALPAY_API_URL.value() || 'https://api.tryglobalpays.com/v1';
  const pubKey = GLOBALPAY_PUB_KEY.value();
  const merchantCode = GLOBALPAYS_MERCHANT_CODE.value() || '4912';

  const res = await fetch(`${baseUrl}/paymentapi/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubKey, merchantCode }),
  });

  const data = await res.json();
  if (data.statusCode !== 1 || !data.token) {
    throw new Error(`GlobalPay auth failed: ${JSON.stringify(data)}`);
  }

  cachedToken = data.token;
  tokenExpiry = Date.now() + 25 * 60 * 1000; // 25 min
  return cachedToken!;
}

export async function queryGlobalPayTransaction(
  gpOrderId: string,
): Promise<Record<string, unknown>> {
  const token = await authenticate();
  const baseUrl = GLOBALPAY_API_URL.value() || 'https://api.tryglobalpays.com/v1';

  const res = await fetch(`${baseUrl}/paymentapi/order/${gpOrderId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  logger.info(`[globalpay] Query ${gpOrderId}: status=${data.status || data.statusCode}`);
  return data;
}
