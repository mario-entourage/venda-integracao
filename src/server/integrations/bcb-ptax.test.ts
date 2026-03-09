/**
 * QA Tests — BCB PTAX Exchange Rate Integration
 *
 * These tests verify:
 *   1. Successful rate fetching and parsing
 *   2. Weekend/holiday retry logic (walks back up to 7 days)
 *   3. Cache behavior (30-min TTL for "today" lookups)
 *   4. Error handling (network errors, HTTP errors, empty responses)
 *   5. Mid-rate calculation (average of buy and sell)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Reset module cache between tests to clear the in-memory ptax cache
let fetchPtaxRate: typeof import('./bcb-ptax').fetchPtaxRate;
let PtaxError: typeof import('./bcb-ptax').PtaxError;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();
  const mod = await import('./bcb-ptax');
  fetchPtaxRate = mod.fetchPtaxRate;
  PtaxError = mod.PtaxError;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeBcbResponse(buyRate: number, sellRate: number, timestamp = '2026-03-05 13:02:27.158') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      value: [
        {
          cotacaoCompra: buyRate,
          cotacaoVenda: sellRate,
          dataHoraCotacao: timestamp,
        },
      ],
    }),
  };
}

function makeEmptyBcbResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ value: [] }),
  };
}

function makeErrorResponse(status = 500) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('fetchPtaxRate', () => {
  describe('successful fetches', () => {
    it('returns a valid PtaxQuote with correct mid-rate calculation', async () => {
      mockFetch.mockResolvedValueOnce(makeBcbResponse(5.148, 5.149));

      const quote = await fetchPtaxRate(new Date('2026-03-05'));

      expect(quote.buyRate).toBe(5.148);
      expect(quote.sellRate).toBe(5.149);
      // Mid-rate = (5.148 + 5.149) / 2 = 5.1485
      expect(quote.midRate).toBe(5.1485);
      expect(quote.quotedAt).toBe('2026-03-05 13:02:27.158');
      expect(quote.queryDate).toBe('2026-03-05');
    });

    it('rounds mid-rate to 5 decimal places', async () => {
      // (5.1234 + 5.6789) / 2 = 5.40115
      mockFetch.mockResolvedValueOnce(makeBcbResponse(5.1234, 5.6789));

      const quote = await fetchPtaxRate(new Date('2026-03-05'));

      expect(quote.midRate).toBe(5.40115);
    });

    it('uses the LAST entry when multiple intraday rates exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            { cotacaoCompra: 5.0, cotacaoVenda: 5.1, dataHoraCotacao: '2026-03-05 10:00:00.000' },
            { cotacaoCompra: 5.2, cotacaoVenda: 5.3, dataHoraCotacao: '2026-03-05 13:02:27.158' },
          ],
        }),
      });

      const quote = await fetchPtaxRate(new Date('2026-03-05'));

      // Should use the second (last) entry
      expect(quote.buyRate).toBe(5.2);
      expect(quote.sellRate).toBe(5.3);
    });
  });

  describe('retry logic for weekends/holidays', () => {
    it('walks back days when response is empty', async () => {
      // Saturday and Sunday: empty. Friday: has rate.
      mockFetch
        .mockResolvedValueOnce(makeEmptyBcbResponse()) // Saturday
        .mockResolvedValueOnce(makeEmptyBcbResponse()) // Friday
        .mockResolvedValueOnce(makeBcbResponse(5.5, 5.6)); // Thursday

      const quote = await fetchPtaxRate(new Date('2026-03-07')); // Saturday

      expect(quote.buyRate).toBe(5.5);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws PtaxError after exhausting all retries', async () => {
      // All 7 days return empty
      for (let i = 0; i < 7; i++) {
        mockFetch.mockResolvedValueOnce(makeEmptyBcbResponse());
      }

      await expect(fetchPtaxRate(new Date('2026-03-05'))).rejects.toThrow(
        /Cotação PTAX indisponível/,
      );
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });

    it('continues past HTTP errors', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503)) // Server error
        .mockResolvedValueOnce(makeBcbResponse(5.0, 5.1)); // Success next day

      const quote = await fetchPtaxRate(new Date('2026-03-05'));

      expect(quote.buyRate).toBe(5.0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('continues past network errors (fetch throws)', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(makeBcbResponse(5.0, 5.1));

      const quote = await fetchPtaxRate(new Date('2026-03-05'));

      expect(quote.buyRate).toBe(5.0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('respects custom maxRetries parameter', async () => {
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce(makeEmptyBcbResponse());
      }

      await expect(fetchPtaxRate(new Date('2026-03-05'), 3)).rejects.toThrow(
        /últimos 3 dias/,
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('caching', () => {
    it('caches "today" lookups and returns cached value on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce(makeBcbResponse(5.0, 5.1));

      // First call — fetches from API
      const quote1 = await fetchPtaxRate(); // no targetDate = "today"

      // Second call — should use cache
      const quote2 = await fetchPtaxRate();

      expect(quote1.buyRate).toBe(5.0);
      expect(quote2.buyRate).toBe(5.0);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch call
    });

    it('does NOT cache historical lookups', async () => {
      mockFetch
        .mockResolvedValueOnce(makeBcbResponse(5.0, 5.1))
        .mockResolvedValueOnce(makeBcbResponse(5.2, 5.3));

      const past = new Date('2026-02-15');
      const quote1 = await fetchPtaxRate(past);
      const quote2 = await fetchPtaxRate(past);

      // Each call should fetch independently
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(quote1.buyRate).toBe(5.0);
      expect(quote2.buyRate).toBe(5.2);
    });
  });

  describe('URL construction', () => {
    it('formats the date as MM-DD-YYYY in the BCB query parameter', async () => {
      // Use a date constructed with explicit year/month/day to avoid timezone issues
      const date = new Date(2026, 2, 5); // March 5, 2026 (month is 0-indexed)
      mockFetch.mockResolvedValueOnce(makeBcbResponse(5.0, 5.1));

      await fetchPtaxRate(date);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("@dataCotacao='03-05-2026'");
    });

    it('includes $format=json in the URL', async () => {
      const date = new Date(2026, 2, 5);
      mockFetch.mockResolvedValueOnce(makeBcbResponse(5.0, 5.1));

      await fetchPtaxRate(date);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('$format=json');
    });
  });
});
