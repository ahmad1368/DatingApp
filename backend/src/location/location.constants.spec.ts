import { kmToMiles, milesToKm } from './location.constants';

describe('distance unit conversion', () => {
  it('converts km to miles', () => {
    expect(kmToMiles(1.60934)).toBeCloseTo(1, 5);
    expect(kmToMiles(0)).toBe(0);
  });

  it('converts miles to km', () => {
    expect(milesToKm(1)).toBeCloseTo(1.60934, 5);
    expect(milesToKm(0)).toBe(0);
  });

  it('round-trips without meaningful drift', () => {
    expect(kmToMiles(milesToKm(50))).toBeCloseTo(50, 6);
  });
});
