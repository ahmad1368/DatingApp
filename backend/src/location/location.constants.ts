export const DEFAULT_SEARCH_RADIUS_KM = 50;
export const MIN_SEARCH_RADIUS_KM = 1;
export const MAX_SEARCH_RADIUS_KM = 500;

// "Crossing paths": two users are considered to have physically crossed
// when they're both within this radius of each other...
export const CROSSING_RADIUS_KM = 0.1;
// ...and both pinged their location within this many minutes of each other
// (keeps crossings "real-time or recent", not a stale location from days ago).
export const CROSSING_RECENCY_MINUTES = 15;
// Once a pair has crossed, don't log another crossing for the same pair
// within this window, so lingering near someone doesn't spam the log.
export const CROSSING_DEDUPE_MINUTES = 30;
// "Throughout the day": how far back the crossed-paths list looks.
export const CROSSING_HISTORY_HOURS = 24;
