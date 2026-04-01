import { describe, it, expect } from 'vitest';
import {
  calculateMarginalCommission,
  calculateMarginalCommissionWithBreakdown,
  getRepTiers,
  getDefaultPayPeriod,
  DEFAULT_TIERS,
  VERA_TIERS,
  HOLY_HEALTH_TIERS,
} from './commission';

describe('calculateMarginalCommission', () => {
  describe('default tiers (10% / 15% / 30%)', () => {
    it('returns 0 for zero sales', () => {
      expect(calculateMarginalCommission(0, DEFAULT_TIERS)).toBe(0);
    });

    it('returns 0 for negative sales', () => {
      expect(calculateMarginalCommission(-1000, DEFAULT_TIERS)).toBe(0);
    });

    it('calculates within first tier', () => {
      expect(calculateMarginalCommission(10_000, DEFAULT_TIERS)).toBe(1_000);
    });

    it('calculates at first tier boundary (exactly 25K)', () => {
      expect(calculateMarginalCommission(25_000, DEFAULT_TIERS)).toBe(2_500);
    });

    it('calculates across first and second tier', () => {
      // 25K * 10% + 1K * 15% = 2500 + 150 = 2650
      expect(calculateMarginalCommission(26_000, DEFAULT_TIERS)).toBe(2_650);
    });

    it('calculates at second tier boundary (exactly 50K)', () => {
      // 25K * 10% + 25K * 15% = 2500 + 3750 = 6250
      expect(calculateMarginalCommission(50_000, DEFAULT_TIERS)).toBe(6_250);
    });

    it('calculates across all three tiers', () => {
      // 25K * 10% + 25K * 15% + 50K * 30% = 2500 + 3750 + 15000 = 21250
      expect(calculateMarginalCommission(100_000, DEFAULT_TIERS)).toBe(21_250);
    });

    it('handles fractional amounts', () => {
      // 1234.56 * 10% = 123.456 → rounded to 123.46
      expect(calculateMarginalCommission(1_234.56, DEFAULT_TIERS)).toBe(123.46);
    });

    it('rounds to 2 decimal places', () => {
      // 33333.33 → 25K*10% + 8333.33*15% = 2500 + 1250.00 = 3750.00
      expect(calculateMarginalCommission(33_333.33, DEFAULT_TIERS)).toBe(3_750);
    });
  });

  describe('Vera Donnangelo tiers (12% / 16% / 30%)', () => {
    it('calculates across first and second tier', () => {
      // 25K * 12% + 1K * 16% = 3000 + 160 = 3160
      expect(calculateMarginalCommission(26_000, VERA_TIERS)).toBe(3_160);
    });

    it('calculates within first tier', () => {
      expect(calculateMarginalCommission(20_000, VERA_TIERS)).toBe(2_400);
    });
  });

  describe('Holy Health tiers (flat 25%)', () => {
    it('calculates flat rate for any amount', () => {
      expect(calculateMarginalCommission(26_000, HOLY_HEALTH_TIERS)).toBe(6_500);
    });

    it('calculates for small amounts', () => {
      expect(calculateMarginalCommission(100, HOLY_HEALTH_TIERS)).toBe(25);
    });
  });
});

describe('calculateMarginalCommissionWithBreakdown', () => {
  it('returns empty for zero sales', () => {
    expect(calculateMarginalCommissionWithBreakdown(0, DEFAULT_TIERS)).toEqual([]);
  });

  it('returns single tier for amount within first tier', () => {
    const result = calculateMarginalCommissionWithBreakdown(10_000, DEFAULT_TIERS);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      range: '0 - 25K',
      rate: 0.10,
      sales: 10_000,
      commission: 1_000,
    });
  });

  it('returns multiple tiers for cross-tier amounts', () => {
    const result = calculateMarginalCommissionWithBreakdown(26_000, DEFAULT_TIERS);
    expect(result).toHaveLength(2);
    expect(result[0].sales).toBe(25_000);
    expect(result[0].commission).toBe(2_500);
    expect(result[1].sales).toBe(1_000);
    expect(result[1].commission).toBe(150);
  });
});

describe('getRepTiers', () => {
  it('returns DEFAULT_TIERS for Camila Belli', () => {
    expect(getRepTiers('Camila Belli')).toBe(DEFAULT_TIERS);
  });

  it('returns VERA_TIERS for Vera Donnangelo', () => {
    expect(getRepTiers('Vera Donnangelo')).toBe(VERA_TIERS);
  });

  it('returns HOLY_HEALTH_TIERS for Holy Health', () => {
    expect(getRepTiers('Holy Health')).toBe(HOLY_HEALTH_TIERS);
  });

  it('falls back to DEFAULT_TIERS for unknown rep', () => {
    expect(getRepTiers('Unknown Person')).toBe(DEFAULT_TIERS);
  });
});

describe('getDefaultPayPeriod', () => {
  it('returns prior month 16th to this month 15th when today is before 15th', () => {
    const today = new Date(2026, 3, 1); // April 1, 2026
    const { start, end } = getDefaultPayPeriod(today);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2); // March
    expect(start.getDate()).toBe(16);
    expect(end.getMonth()).toBe(3); // April
    expect(end.getDate()).toBe(15);
  });

  it('returns prior month 16th to this month 15th when today is the 15th', () => {
    const today = new Date(2026, 3, 15); // April 15, 2026
    const { start, end } = getDefaultPayPeriod(today);
    expect(start.getMonth()).toBe(2); // March
    expect(start.getDate()).toBe(16);
    expect(end.getMonth()).toBe(3); // April
    expect(end.getDate()).toBe(15);
  });

  it('returns this month 16th to next month 15th when today is after 15th', () => {
    const today = new Date(2026, 3, 20); // April 20, 2026
    const { start, end } = getDefaultPayPeriod(today);
    expect(start.getMonth()).toBe(3); // April
    expect(start.getDate()).toBe(16);
    expect(end.getMonth()).toBe(4); // May
    expect(end.getDate()).toBe(15);
  });

  it('handles year boundary (January before 15th)', () => {
    const today = new Date(2026, 0, 10); // Jan 10, 2026
    const { start, end } = getDefaultPayPeriod(today);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11); // December
    expect(start.getDate()).toBe(16);
    expect(end.getMonth()).toBe(0); // January
    expect(end.getDate()).toBe(15);
  });
});
