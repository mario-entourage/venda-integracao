'use server';

import { fetchPtaxRate, PtaxError } from '@/server/integrations/bcb-ptax';

/**
 * Fetch the latest PTAX midpoint exchange rate (USD → BRL) from the
 * Central Bank of Brazil.
 *
 * Called once when the Vendas wizard mounts so all product prices can
 * be displayed / negotiated in BRL.
 */
export async function getPtaxRate(): Promise<{
  midRate: number;
  buyRate: number;
  sellRate: number;
  quotedAt: string;
  queryDate: string;
  error?: string;
}> {
  try {
    const quote = await fetchPtaxRate();
    return {
      midRate: quote.midRate,
      buyRate: quote.buyRate,
      sellRate: quote.sellRate,
      quotedAt: quote.quotedAt,
      queryDate: quote.queryDate,
    };
  } catch (err) {
    console.error('[getPtaxRate] Error:', err);
    const message =
      err instanceof PtaxError
        ? err.message
        : 'Erro ao buscar cotação PTAX.';
    return {
      midRate: 0,
      buyRate: 0,
      sellRate: 0,
      quotedAt: '',
      queryDate: '',
      error: message,
    };
  }
}
