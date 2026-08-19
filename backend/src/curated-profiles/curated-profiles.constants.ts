export const DAILY_PICKS_LIMIT = 6;
export const CANDIDATE_POOL_SIZE = 30;
export const DAILY_REFRESH_HOUR_UTC = 12;

/**
 * Curated picks refresh once per "curation day": the window that starts at
 * DAILY_REFRESH_HOUR_UTC and runs until the same time the next day. Returns
 * the start of the window `now` falls into.
 */
export function computeWindowStart(now: Date): Date {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_REFRESH_HOUR_UTC, 0, 0, 0),
  );
  if (now.getTime() < windowStart.getTime()) {
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  }
  return windowStart;
}
