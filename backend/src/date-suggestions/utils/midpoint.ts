export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Simple lat/lng average of two points. Not geodesically exact, but the
 * error is negligible at the city-scale distances a date meetup spans
 * (same approximation tradeoff the existing haversine util makes).
 */
export function computeMidpoint(a: Coordinates, b: Coordinates): Coordinates {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}
