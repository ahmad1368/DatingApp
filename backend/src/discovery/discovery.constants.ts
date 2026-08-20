export const SWIPE_ACTIONS = ['LIKE', 'PASS', 'SUPER_LIKE'] as const;

export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

export const LIKE_ACTIONS: SwipeAction[] = ['LIKE', 'SUPER_LIKE'];

export const DEFAULT_DECK_SIZE = 20;

export const ACTIVE_MODES = ['DATING', 'BFF', 'BIZZ'] as const;

export type ActiveMode = (typeof ACTIVE_MODES)[number];

export const DAILY_SUPER_LIKE_LIMIT = 1;

export const BOOST_DURATION_MINUTES = 30;

export const SNOOZE_MAX_DURATION_DAYS = 90;
export const SNOOZE_DEFAULT_DURATION_DAYS = 7;

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
