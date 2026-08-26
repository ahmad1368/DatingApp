export const SWIPE_ACTIONS = ['LIKE', 'PASS', 'SUPER_LIKE'] as const;

export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

export const LIKE_ACTIONS: SwipeAction[] = ['LIKE', 'SUPER_LIKE'];

/**
 * Optional quick-pick reason shown after a pass; stored for future match
 * algorithm tuning, but there's no retraining pipeline in this codebase to
 * actually consume it yet - it's just captured feedback for now.
 */
export const PASS_REASONS = [
  'Not my type',
  'Too far away',
  'Not enough info',
  'Inappropriate profile',
  'Just not feeling it',
] as const;

export type PassReason = (typeof PASS_REASONS)[number];

export const DEFAULT_DECK_SIZE = 20;

/** How many candidates DiscoveryService.getVideoFeed returns per fetch. */
export const VIDEO_FEED_SIZE = 20;

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

/**
 * Happy Hour: once daily during a fixed peak-engagement window (see the
 * SUPER_BOOST_PEAK_HOUR note on per-user timezone limitations - same
 * approximation applies here), liking a profile grants extra free super
 * likes for the day and a temporary visibility Boost - see
 * DiscoveryService.recordSwipe/grantHappyHourBoost.
 */
export const HAPPY_HOUR_START_UTC = 17;
export const HAPPY_HOUR_END_UTC = 19;
export const HAPPY_HOUR_BONUS_SUPER_LIKES = 2;
export const HAPPY_HOUR_VIEW_MULTIPLIER = 2;

export function isHappyHour(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= HAPPY_HOUR_START_UTC && hour < HAPPY_HOUR_END_UTC;
}

export function computeHappyHourWindow(now: Date): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HAPPY_HOUR_START_UTC),
  );
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HAPPY_HOUR_END_UTC));
  return { startsAt, endsAt };
}

export const SNOOZE_MAX_DURATION_DAYS = 90;
export const SNOOZE_DEFAULT_DURATION_DAYS = 7;

/** Minimum swipes a photo must have been shown for before it's eligible to be
 * rotated into the lead position based on its conversion rate. */
export const MIN_SWIPES_FOR_PHOTO_ROTATION = 5;

/**
 * Dynamic deck reordering: the non-priority ("remaining") candidate pool is
 * fetched larger than the deck actually needs, ranked by proximity plus
 * recent right-swipe trendiness, then trimmed - so the ordering can
 * actually change as location and recent engagement change, not just the
 * DB's default row order.
 */
export const REMAINING_CANDIDATE_POOL_SIZE = 60;
export const TRENDING_WINDOW_DAYS = 3;
export const TRENDING_BONUS_PER_RIGHT_SWIPE = 5;
export const TRENDING_BONUS_CAP = 50;
/** Distance in km at which the proximity score bottoms out at 0. */
export const PROXIMITY_SCORE_DECAY_KM = 100;

/**
 * Radius-based deck filtering: the "remaining" pool is restricted to
 * User.searchRadiusKm before ranking. If that leaves fewer than this many
 * candidates (and the radius actually excluded someone), and the viewer has
 * auto-expand enabled, the radius is widened by RADIUS_EXPANSION_MULTIPLIER
 * for that one fetch - see DiscoveryService.getDeck.
 */
export const MIN_CANDIDATES_BEFORE_RADIUS_EXPANSION = 5;
export const RADIUS_EXPANSION_MULTIPLIER = 2;

export function computeTrendingWindowStart(now: Date): Date {
  return new Date(now.getTime() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

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

/**
 * Algorithm-driven match quality feedback: the client prompts for one of
 * these ratings every DECK_FEEDBACK_SWIPE_INTERVAL swipes (tracked client
 * side - see the mobile swipe deck screen), then submits it via
 * DiscoveryService.submitDeckFeedback. A low rating is treated as a signal
 * that the "remaining" pool's trending-driven picks are surfacing profiles
 * too far away to be relevant, so it nudges this user's proximity weight up
 * (closer candidates score relatively higher in rankRemainingCandidates); a
 * good rating eases back off that bias. There is no separate "trending
 * weight" - proximity and trending are on the same additive score, so
 * scaling proximity is equivalent to de-emphasizing trending.
 */
export const DECK_FEEDBACK_SWIPE_INTERVAL = 10;

export const DECK_FEEDBACK_RATINGS = ['GOOD', 'OKAY', 'BAD'] as const;
export type DeckFeedbackRating = (typeof DECK_FEEDBACK_RATINGS)[number];

export const DECK_FEEDBACK_WEIGHT_DELTA: Record<DeckFeedbackRating, number> = {
  GOOD: -0.1,
  OKAY: 0.15,
  BAD: 0.3,
};

export const DEFAULT_PROXIMITY_WEIGHT = 1;
export const MIN_PROXIMITY_WEIGHT = 0.5;
export const MAX_PROXIMITY_WEIGHT = 3;

export function applyDeckFeedback(currentWeight: number, rating: DeckFeedbackRating): number {
  const adjusted = currentWeight + DECK_FEEDBACK_WEIGHT_DELTA[rating];
  return Math.min(MAX_PROXIMITY_WEIGHT, Math.max(MIN_PROXIMITY_WEIGHT, adjusted));
}
