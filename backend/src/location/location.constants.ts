export const DEFAULT_SEARCH_RADIUS_KM = 50;
export const MIN_SEARCH_RADIUS_KM = 1;
export const MAX_SEARCH_RADIUS_KM = 500;

// The slider's underlying value always stays in km (see MIN/MAX_SEARCH_RADIUS_KM
// above); DISTANCE_UNITS is only a per-user display/input preference so the
// client can render and accept whole miles instead.
export const DISTANCE_UNITS = ['KM', 'MI'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'KM';

const KM_PER_MILE = 1.60934;

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

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

// Decimal places a crossing's lat/lng is rounded to for the map overlay -
// ~0.001 degrees is roughly a neighborhood/landmark-sized block, coarse
// enough that it never reveals an exact meeting point.
export const CROSSING_ZONE_PRECISION = 3;

export function roundToZone(value: number): number {
  const factor = 10 ** CROSSING_ZONE_PRECISION;
  return Math.round(value * factor) / factor;
}
