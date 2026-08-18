import { haversineDistanceKm } from './haversine';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceKm(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });

  it('returns roughly 111km for one degree of latitude', () => {
    const distance = haversineDistanceKm(0, 0, 1, 0);
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(112);
  });

  it('returns roughly the known distance between London and Paris', () => {
    const distance = haversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(distance).toBeGreaterThan(330);
    expect(distance).toBeLessThan(350);
  });
});
