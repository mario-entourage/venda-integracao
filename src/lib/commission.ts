/**
 * Commission calculation library.
 *
 * Marginal (progressive) rate calculation: each tier's rate applies only to
 * the revenue within that tier's [min, max) range. Revenue is allocated
 * incrementally across tiers. All results rounded to 2 decimal places.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  TIER FLOW (default)                                    │
 * │  ┌──────────┐   ┌──────────────┐   ┌──────────────┐    │
 * │  │ 0 – 25K  │──▶│ 25K – 50K    │──▶│ 50K+         │    │
 * │  │ rate: 10%│   │ rate: 15%    │   │ rate: 30%    │    │
 * │  └──────────┘   └──────────────┘   └──────────────┘    │
 * └─────────────────────────────────────────────────────────┘
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface CommissionTier {
  /** Inclusive lower bound of gross sales for this tier */
  min: number;
  /** Exclusive upper bound (use Infinity for the last tier) */
  max: number;
  /** Commission rate as a decimal (0.10 = 10%) */
  rate: number;
}

export interface RepCommissionResult {
  userId: string;
  name: string;
  grossSales: number;
  orderCount: number;
  commission: number;
  tiers: TierBreakdown[];
}

export interface TierBreakdown {
  range: string;
  rate: number;
  sales: number;
  commission: number;
}

export interface CommissionResponse {
  period: { start: string; end: string };
  statuses: string[];
  reps: RepCommissionResult[];
  totals: { grossSales: number; commission: number; orderCount: number };
}

// ── Tier Configs ───────────────────────────────────────────────────────────

export const DEFAULT_TIERS: CommissionTier[] = [
  { min: 0, max: 25_000, rate: 0.10 },
  { min: 25_000, max: 50_000, rate: 0.15 },
  { min: 50_000, max: Infinity, rate: 0.30 },
];

export const VERA_TIERS: CommissionTier[] = [
  { min: 0, max: 25_000, rate: 0.12 },
  { min: 25_000, max: 50_000, rate: 0.16 },
  { min: 50_000, max: Infinity, rate: 0.30 },
];

export const HOLY_HEALTH_TIERS: CommissionTier[] = [
  { min: 0, max: Infinity, rate: 0.25 },
];

/**
 * Map of rep display names to their commission tier configuration.
 * Unknown reps fall back to DEFAULT_TIERS.
 */
export const REP_TIERS: Record<string, CommissionTier[]> = {
  'Camila Belli': DEFAULT_TIERS,
  'Euclides Bomfim': DEFAULT_TIERS,
  'Raquel Aranha': DEFAULT_TIERS,
  'Vera Donnangelo': VERA_TIERS,
  'Holy Health': HOLY_HEALTH_TIERS,
};

// ── Pure Functions ─────────────────────────────────────────────────────────

/**
 * Calculate marginal (progressive) commission for a given gross sales amount.
 *
 * Each tier's rate applies only to the portion of sales within [min, max).
 * Example: R$26,000 with default tiers → 25K*10% + 1K*15% = R$2,650.
 */
export function calculateMarginalCommission(
  grossSales: number,
  tiers: CommissionTier[],
): number {
  if (grossSales <= 0) return 0;

  let total = 0;
  for (const tier of tiers) {
    if (grossSales <= tier.min) break;
    const taxable = Math.min(grossSales, tier.max) - tier.min;
    total += taxable * tier.rate;
  }

  return Math.round(total * 100) / 100;
}

/**
 * Calculate marginal commission with per-tier breakdown for display.
 */
export function calculateMarginalCommissionWithBreakdown(
  grossSales: number,
  tiers: CommissionTier[],
): TierBreakdown[] {
  if (grossSales <= 0) return [];

  const result: TierBreakdown[] = [];
  for (const tier of tiers) {
    if (grossSales <= tier.min) break;
    const sales = Math.min(grossSales, tier.max) - tier.min;
    const commission = Math.round(sales * tier.rate * 100) / 100;

    const maxLabel = tier.max === Infinity ? '+' : fmtK(tier.max);
    const range = tier.max === Infinity
      ? `${fmtK(tier.min)}+`
      : `${fmtK(tier.min)} - ${maxLabel}`;

    result.push({ range, rate: tier.rate, sales, commission });
  }

  return result;
}

/** Format a number as compact thousands (e.g., 25000 → "25K") */
function fmtK(n: number): string {
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}K`;
  return n.toLocaleString('pt-BR');
}

/**
 * Get the commission tiers for a rep by display name.
 * Falls back to DEFAULT_TIERS for unknown reps.
 */
export function getRepTiers(repName: string): CommissionTier[] {
  return REP_TIERS[repName] ?? DEFAULT_TIERS;
}

/**
 * Get the default pay period boundaries.
 *
 * Convention: 16th of prior month to 15th of current month.
 * If today is past the 15th, the period shifts forward:
 *   - Before/on 15th: start = prior month 16th, end = this month 15th
 *   - After 15th: start = this month 16th, end = next month 15th
 */
export function getDefaultPayPeriod(today?: Date): { start: Date; end: Date } {
  const now = today ?? new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  if (now.getDate() <= 15) {
    // Before or on the 15th: period = prior month 16th → this month 15th
    const start = new Date(year, month - 1, 16, 0, 0, 0, 0);
    const end = new Date(year, month, 15, 23, 59, 59, 999);
    return { start, end };
  } else {
    // After the 15th: period = this month 16th → next month 15th
    const start = new Date(year, month, 16, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 15, 23, 59, 59, 999);
    return { start, end };
  }
}
