// Speed Dating is a scheduled weekly live event, not an always-open queue
// (unlike blind dating) - joining is only accepted while the event window
// is open. Computed at read time, same no-cron approach used for the blind
// date session TTL and Happy Hour elsewhere.
export const EVENT_DAY_OF_WEEK = 3; // Date#getUTCDay(): 0 = Sunday, 3 = Wednesday
export const EVENT_START_HOUR_UTC = 19;
export const EVENT_END_HOUR_UTC = 20;

// Each pairing gets a single fixed-length video round before both sides
// decide whether to match.
export const ROUND_DURATION_MINUTES = 3;

export function isEventLive(now: Date): boolean {
  return (
    now.getUTCDay() === EVENT_DAY_OF_WEEK &&
    now.getUTCHours() >= EVENT_START_HOUR_UTC &&
    now.getUTCHours() < EVENT_END_HOUR_UTC
  );
}

export function computeRoundEndsAt(from: Date): Date {
  return new Date(from.getTime() + ROUND_DURATION_MINUTES * 60 * 1000);
}
