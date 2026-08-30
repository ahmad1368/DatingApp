import { MAX_PROXIMITY_WEIGHT, MIN_PROXIMITY_WEIGHT } from '../discovery/discovery.constants';

export const MATCH_QUALITY_RATINGS = ['GREAT', 'GOOD', 'OK', 'POOR'] as const;

export type MatchQualityRating = (typeof MATCH_QUALITY_RATINGS)[number];

/**
 * "Algorithm training" from a real, validated in-person outcome (as opposed
 * to DiscoveryService's pre-date deck feedback, which is only a guess at
 * how well the deck itself is calibrated): nudges the same
 * User.discoveryProximityWeight knob DiscoveryService.applyDeckFeedback
 * uses, on the same 1.0-default/0.5-3.0-clamped scale, when a survey
 * reports the pair actually met in person. A great/good outcome eases the
 * bias toward closer candidates back off; an ok/poor one leans further into
 * it, on the theory that the trending-driven "remaining" pool is still
 * surfacing matches too far away to be worth pursuing. See
 * DiscoveryService.rankRemainingCandidates for where the weight is spent.
 */
export const MATCH_QUALITY_WEIGHT_DELTA: Record<MatchQualityRating, number> = {
  GREAT: -0.15,
  GOOD: -0.1,
  OK: 0.05,
  POOR: 0.2,
};

export function applyMatchQualityFeedback(currentWeight: number, rating: MatchQualityRating): number {
  const adjusted = currentWeight + MATCH_QUALITY_WEIGHT_DELTA[rating];
  return Math.min(MAX_PROXIMITY_WEIGHT, Math.max(MIN_PROXIMITY_WEIGHT, adjusted));
}

/**
 * "We Met Survey" prompt trigger: once a match's chat shows a real sign
 * they may have actually gone on a date - a message containing something
 * that looks like a phone number, or the thread simply growing long -
 * PostMatchSurveyService.listDuePrompts waits this many days before
 * surfacing the prompt, so it lands after there was reasonably time for a
 * date to have happened rather than the moment the signal appears.
 */
export const SURVEY_PROMPT_DELAY_DAYS = 2;

/** Message count at which a thread counts as a "long chat stream" signal. */
export const LONG_CHAT_MESSAGE_THRESHOLD = 20;

// Stands in for real phone-number/PII detection (no such library exists in
// this codebase): a run of digits, loosely grouped with spaces, dots,
// dashes, or parentheses, whose digit count falls in a plausible phone
// number range - a deliberately loose heuristic, not a validated phone
// number format.
const PHONE_NUMBER_LIKE_PATTERN = /\d[\d\s.\-()]{5,20}\d/;

export function containsPhoneNumberLikeText(content: string): boolean {
  const match = content.match(PHONE_NUMBER_LIKE_PATTERN);
  if (!match) {
    return false;
  }
  const digitCount = (match[0].match(/\d/g) ?? []).length;
  return digitCount >= 7 && digitCount <= 15;
}

export function daysSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
}
