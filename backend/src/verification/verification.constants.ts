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
