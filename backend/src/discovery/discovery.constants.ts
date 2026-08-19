export const SWIPE_ACTIONS = ['LIKE', 'PASS', 'SUPER_LIKE'] as const;

export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

export const LIKE_ACTIONS: SwipeAction[] = ['LIKE', 'SUPER_LIKE'];

export const DEFAULT_DECK_SIZE = 20;

export const DAILY_SUPER_LIKE_LIMIT = 1;

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
