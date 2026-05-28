import { Timestamp } from 'firebase-admin/firestore';

/**
 * Shared helpers for parsing `from` / `to` / `date` query params on
 * external API endpoints. Defaults to "today" (UTC) when nothing is
 * provided. Caps the range to MAX_RANGE_DAYS to prevent expensive scans.
 */

export const MAX_RANGE_DAYS = 92;

export interface DateRange {
  fromTs: Timestamp;
  toTs: Timestamp;
  fromIso: string;
  toIso: string;
}

export class DateRangeError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

function parseIsoDay(input: string, kind: 'from' | 'to' | 'date'): Date {
  // Accept YYYY-MM-DD; treat as UTC day boundary
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new DateRangeError(
      `Invalid \`${kind}\` value — expected YYYY-MM-DD, got "${input}"`,
    );
  }
  const d = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new DateRangeError(`Invalid \`${kind}\` value "${input}"`);
  }
  return d;
}

export function parseDateRange(url: URL): DateRange {
  const date = url.searchParams.get('date');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let start: Date;
  let endExclusive: Date;

  if (date) {
    start = parseIsoDay(date, 'date');
    endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  } else if (from || to) {
    if (!from || !to) {
      throw new DateRangeError('Provide both `from` and `to`, or use `date`.');
    }
    start = parseIsoDay(from, 'from');
    const toDay = parseIsoDay(to, 'to');
    endExclusive = new Date(toDay.getTime() + 24 * 60 * 60 * 1000); // inclusive of `to`
  } else {
    // Default: today in UTC
    const now = new Date();
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  if (endExclusive <= start) {
    throw new DateRangeError('`to` must be on or after `from`.');
  }

  const days = (endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_RANGE_DAYS) {
    throw new DateRangeError(
      `Date range too large (${days} days). Max is ${MAX_RANGE_DAYS}.`,
    );
  }

  return {
    fromTs: Timestamp.fromDate(start),
    toTs: Timestamp.fromDate(endExclusive),
    fromIso: start.toISOString().slice(0, 10),
    // Reported `to` is inclusive in the response
    toIso: new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}
