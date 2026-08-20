export const DAILY_PICKS_LIMIT = 6;
export const CANDIDATE_POOL_SIZE = 30;
export const DAILY_REFRESH_HOUR_UTC = 12;
export const STANDOUT_ENGAGEMENT_THRESHOLD = 3;
export const STANDOUT_ENGAGEMENT_WINDOW_DAYS = 7;
export const STANDOUT_ENGAGEMENT_BONUS_PER_LIKE = 2;
export const STANDOUT_ENGAGEMENT_BONUS_CAP = 20;

export function computeEngagementWindowStart(now: Date): Date {
  return new Date(now.getTime() - STANDOUT_ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

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
