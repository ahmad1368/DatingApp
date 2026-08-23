export const SWIPE_ACTIONS = ['LIKE', 'PASS', 'SUPER_LIKE'] as const;

export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

export const LIKE_ACTIONS: SwipeAction[] = ['LIKE', 'SUPER_LIKE'];

export const DEFAULT_DECK_SIZE = 20;

export const ACTIVE_MODES = ['DATING', 'BFF', 'BIZZ'] as const;

export type ActiveMode = (typeof ACTIVE_MODES)[number];

/** How the "who liked you" backlog can be sorted; RECENT (most recently liked first) is the default. */
export const LIKED_BY_SORT_OPTIONS = ['RECENT', 'PROXIMITY', 'COMPATIBILITY'] as const;

export type LikedBySort = (typeof LIKED_BY_SORT_OPTIONS)[number];

export const DAILY_SUPER_LIKE_LIMIT = 1;

export const BOOST_DURATION_MINUTES = 30;

export const SUPER_BOOST_PEAK_HOUR_START_UTC = 18;
export const SUPER_BOOST_PEAK_HOUR_END_UTC = 22;
export const SUPER_BOOST_PEAK_VIEW_MULTIPLIER = 100;
export const SUPER_BOOST_OFF_PEAK_VIEW_MULTIPLIER = 10;

/**
 * Stands in for real per-user local peak-activity detection (this codebase
 * doesn't track user timezones): treats a fixed UTC evening window as "peak
 * hours" for everyone.
 */
export function isSuperBoostPeakHour(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= SUPER_BOOST_PEAK_HOUR_START_UTC && hour < SUPER_BOOST_PEAK_HOUR_END_UTC;
}

export const SNOOZE_MAX_DURATION_DAYS = 90;
export const SNOOZE_DEFAULT_DURATION_DAYS = 7;

/** Minimum swipes a photo must have been shown for before it's eligible to be
 * rotated into the lead position based on its conversion rate. */
export const MIN_SWIPES_FOR_PHOTO_ROTATION = 5;

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function computeBoostExpiresAt(from: Date): Date {
  return new Date(from.getTime() + BOOST_DURATION_MINUTES * 60 * 1000);
}

export function computeDefaultSnoozeUntil(from: Date): Date {
  return new Date(from.getTime() + SNOOZE_DEFAULT_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

export function computeMaxSnoozeUntil(from: Date): Date {
  return new Date(from.getTime() + SNOOZE_MAX_DURATION_DAYS * 24 * 60 * 60 * 1000);
}
