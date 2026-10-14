/**
 * Date helpers that respect the Kraya CRM operating timezone (IST / Asia/Kolkata).
 *
 * Kraya's API returns timestamps in UTC (`2026-05-07T00:01:32.000000Z`).
 * Kraya's UI and ops team think in IST (UTC+5:30). A lead created at
 * `2026-05-07 00:01 IST` is `2026-05-06 18:31 UTC`. If we slice the UTC
 * timestamp's first 10 characters and compare to "2026-05-07", we lose
 * roughly 5h30m worth of leads to the previous UTC day every day.
 *
 * Always go through `toIstDate()` when bucketing per day, comparing dates
 * for filters, or building daily trend rows.
 */

const IST_OFFSET_MINUTES = 330; // +05:30

/**
 * Convert any ISO-ish timestamp to its IST date (YYYY-MM-DD).
 *
 *   toIstDate('2026-05-07T00:01:32.000000Z') => '2026-05-07'  ✓
 *   toIstDate('2026-05-06T18:31:32Z')        => '2026-05-07'  ✓ (00:01 IST)
 *   toIstDate('2026-05-07T18:30:00Z')        => '2026-05-08'  ✓ (00:00 IST)
 *
 * If the input is already a YYYY-MM-DD string (no time portion), it's
 * returned as-is — those are already understood as IST calendar dates.
 */
export function toIstDate(input: string | undefined | null): string {
  if (!input) return '';
  const s = String(input).trim();
  if (!s) return '';
  // Already a calendar date (no T, length 10 like "2026-05-07")?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) {
    // Last-ditch fallback: leave UTC slice if parse fails so we don't crash.
    return s.slice(0, 10);
  }
  const ist = new Date(ms + IST_OFFSET_MINUTES * 60 * 1000);
  // We can use UTC getters now because we've shifted into IST as a UTC moment.
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Compare two YYYY-MM-DD strings (lexicographic == chronological for ISO date). */
export function dateInRange(dateStr: string, from: string, to: string): boolean {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}
