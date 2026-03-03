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

/**
 * Fetch the PTAX rate for a specific historical date.
 * Used by CSV bulk import to auto-fill exchange rates.
 *
 * @param dateStr  Date in YYYY-MM-DD format.
 */
export async function getPtaxRateForDate(dateStr: string): Promise<{
  midRate: number;
  queryDate: string;
  error?: string;
}> {
  try {
    const date = new Date(dateStr + 'T12:00:00');
    if (isNaN(date.getTime())) {
      return { midRate: 0, queryDate: '', error: 'Data inválida.' };
    }
    const quote = await fetchPtaxRate(date);
    return { midRate: quote.midRate, queryDate: quote.queryDate };
  } catch (err) {
    console.error('[getPtaxRateForDate] Error:', err);
    const message =
      err instanceof PtaxError
        ? err.message
        : 'Erro ao buscar cotação PTAX.';
    return { midRate: 0, queryDate: '', error: message };
  }
}
