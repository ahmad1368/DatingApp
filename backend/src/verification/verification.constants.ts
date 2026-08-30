export const SELFIE_GESTURES = [
  'SMILE',
  'TURN_HEAD_LEFT',
  'TURN_HEAD_RIGHT',
  'RAISE_RIGHT_HAND',
  'WINK',
] as const;

export type SelfieGesture = (typeof SELFIE_GESTURES)[number];

export const DEFAULT_CHALLENGE_TTL_SECONDS = 120;
export const DEFAULT_MIN_MATCH_CONFIDENCE = 0.8;

// How long a passed verification stays valid before it's periodically due
// for re-checking again, even if the profile photo never changed.
export const DEFAULT_REVERIFICATION_INTERVAL_DAYS = 90;

export const REVERIFICATION_REASONS = ['PHOTO_CHANGED', 'PERIODIC'] as const;

export type ReverificationReason = (typeof REVERIFICATION_REASONS)[number];
