export const SWIPE_ACTIONS = ['LIKE', 'PASS'] as const;

export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

export const DEFAULT_DECK_SIZE = 20;
