import { kmToMiles, milesToKm, roundToZone } from './location.constants';

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

describe('roundToZone', () => {
  it('rounds to the configured decimal precision', () => {
    expect(roundToZone(40.712776)).toBe(40.713);
    expect(roundToZone(-73.935242)).toBe(-73.935);
  });

  it('groups nearby coordinates into the same zone', () => {
    expect(roundToZone(40.71281)).toBe(roundToZone(40.71276));
  });

  it('leaves an already-coarse value unchanged', () => {
    expect(roundToZone(40.713)).toBe(40.713);
  });
});
