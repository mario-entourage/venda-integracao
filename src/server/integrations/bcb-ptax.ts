/**
 * BCB PTAX exchange-rate integration.
 *
 * Fetches the daily USD → BRL reference rate from the Central Bank of Brazil's
 * public OData API. No authentication required.
 *
 * Endpoint:
 *   GET https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/
 *       CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='MM-DD-YYYY'&$format=json
 *
 * Response (when available):
 *   { "value": [{ "cotacaoCompra": 5.148, "cotacaoVenda": 5.149, "dataHoraCotacao": "..." }] }
 *
 * On weekends / holidays / early mornings the `value` array is empty — we
 * retry with previous calendar days until we find a published rate.
 */

// ─── types ───────────────────────────────────────────────────────────────────

export interface PtaxQuote {
  /** Buy rate (cotacaoCompra) */
  buyRate: number;
  /** Sell rate (cotacaoVenda) */
  sellRate: number;
  /** Midpoint = (buyRate + sellRate) / 2, rounded to 5 decimal places */
  midRate: number;
  /** BCB timestamp string, e.g. "2026-02-27 13:02:27.158" */
  quotedAt: string;
  /** The calendar date whose rate was used (YYYY-MM-DD) */
  queryDate: string;
}

export class PtaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PtaxError';
  }
}

// ─── cache ───────────────────────────────────────────────────────────────────

interface CachedPtax {
  quote: PtaxQuote;
  fetchedAt: number;
}

/** Module-level cache — shared across requests within the same server process. */
let ptaxCache: CachedPtax | null = null;

/** How long to reuse a cached rate before re-fetching (30 minutes). */
const CACHE_TTL_MS = 30 * 60 * 1000;

// ─── helpers ─────────────────────────────────────────────────────────────────

const BCB_BASE_URL =
  'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

/**
 * Format a Date as the BCB-expected query parameter: `'MM-DD-YYYY'`.
 */
function formatBcbDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `'${mm}-${dd}-${yyyy}'`;
}

/**
 * Format a Date as YYYY-MM-DD for storage / display.
 */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Fetch the latest PTAX USD → BRL rate from the BCB.
 *
 * If today's rate is not yet published (weekends, holidays, early morning
 * before ~13:00 BRT), it walks backwards day-by-day until it finds one,
 * up to `maxRetries` attempts.
 *
 * Results are cached for 30 minutes in-memory.
 *
 * @param maxRetries  Maximum days to look back (default 7, handles long
 *                    holiday stretches like Carnival).
 */
export async function fetchPtaxRate(maxRetries = 7): Promise<PtaxQuote> {
  // Return cached value if still fresh
  if (ptaxCache && Date.now() - ptaxCache.fetchedAt < CACHE_TTL_MS) {
    return ptaxCache.quote;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const date = new Date();
    date.setDate(date.getDate() - attempt);

    const bcbDate = formatBcbDate(date);
    const url = `${BCB_BASE_URL}/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=${bcbDate}&$format=json`;

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        // Short timeout — BCB is generally fast
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        console.warn(`[bcb-ptax] HTTP ${res.status} for ${bcbDate}, retrying…`);
        continue;
      }

      const json = await res.json();
      const values = json.value as Array<{
        cotacaoCompra: number;
        cotacaoVenda: number;
        dataHoraCotacao: string;
      }> | undefined;

      if (!values || values.length === 0) {
        // No rate published for this date — try the previous day
        continue;
      }

      // Use the last entry (most recent intraday quote for that date)
      const entry = values[values.length - 1];
      const buyRate = entry.cotacaoCompra;
      const sellRate = entry.cotacaoVenda;
      const midRate = parseFloat(((buyRate + sellRate) / 2).toFixed(5));

      const quote: PtaxQuote = {
        buyRate,
        sellRate,
        midRate,
        quotedAt: entry.dataHoraCotacao,
        queryDate: toIsoDate(date),
      };

      // Cache the result
      ptaxCache = { quote, fetchedAt: Date.now() };
      return quote;
    } catch (err) {
      console.warn(`[bcb-ptax] Fetch error for ${bcbDate}:`, err);
      // Network error — continue to try previous day
      continue;
    }
  }

  throw new PtaxError(
    `Cotação PTAX indisponível. Nenhuma cotação encontrada nos últimos ${maxRetries} dias.`,
  );
}
