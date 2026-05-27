import { Timestamp } from 'firebase/firestore';

/**
 * Permission level granted to an external API key. Cumulative:
 *   L1 — business data: sales reps (with daily stats), doctors (with
 *        daily prescription stats), logistics category (no fields yet
 *        pending new shipping integration)
 *   L2 — adds patient identity/contact (no health info)
 *   L3 — adds health data: prescriptions, ANVISA authorizations,
 *        order product details
 */
export type ApiKeyLevel = 'L1' | 'L2' | 'L3';

export const API_KEY_LEVELS: ApiKeyLevel[] = ['L1', 'L2', 'L3'];

export const API_KEY_LEVEL_LABELS: Record<ApiKeyLevel, string> = {
  L1: 'L1 — Business (sales reps, doctors, logistics)',
  L2: 'L2 — Business + Patient identity',
  L3: 'L3 — Business + Patient + Health data',
};

export interface ApiKey {
  id: string;
  /** Human-readable label set at creation time */
  name: string;
  /** SHA-256 hex digest of the plaintext key. The plaintext is never stored. */
  keyHash: string;
  /** First 8 chars of the plaintext key, shown in UI to help identify keys. */
  keyPrefix: string;
  level: ApiKeyLevel;
  active: boolean;
  createdAt: Timestamp;
  createdById: string;
  createdByEmail: string;
  lastUsedAt?: Timestamp;
  /** Total request count served by this key. */
  requestCount?: number;
  revokedAt?: Timestamp;
  revokedById?: string;
}

/** Numeric value used to compare cumulative levels: L1 < L2 < L3. */
export function levelRank(level: ApiKeyLevel): number {
  return level === 'L1' ? 1 : level === 'L2' ? 2 : 3;
}

/** True if `granted` covers everything `required` allows. */
export function levelSatisfies(granted: ApiKeyLevel, required: ApiKeyLevel): boolean {
  return levelRank(granted) >= levelRank(required);
}
