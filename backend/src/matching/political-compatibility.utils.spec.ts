import { computePoliticalAlignmentScore } from './political-compatibility.utils';

describe('computePoliticalAlignmentScore', () => {
  it('returns null when either side has not declared an orientation', () => {
    expect(computePoliticalAlignmentScore(null, 'Moderate', null, null)).toBeNull();
    expect(computePoliticalAlignmentScore('Moderate', null, null, null)).toBeNull();
  });

  it('scores 100 for identical spectrum orientations', () => {
    expect(computePoliticalAlignmentScore('Progressive', 'Progressive', null, null)).toBe(100);
  });

  it('scores lower the further apart two spectrum orientations are', () => {
    const adjacent = computePoliticalAlignmentScore('Progressive', 'Liberal', null, null)!;
    const opposite = computePoliticalAlignmentScore('Progressive', 'Libertarian', null, null)!;

    expect(adjacent).toBeGreaterThan(opposite);
    expect(opposite).toBe(0);
  });

  it('falls back to a flat neutral score when either side is off the spectrum', () => {
    expect(computePoliticalAlignmentScore('Apolitical', 'Conservative', null, null)).toBe(60);
    expect(computePoliticalAlignmentScore('Progressive', 'Prefer Not to Say', null, null)).toBe(60);
  });

  it('blends in civic activity closeness when both sides have set one', () => {
    const withoutCivic = computePoliticalAlignmentScore('Moderate', 'Moderate', null, null)!;
    const closeCivic = computePoliticalAlignmentScore(
      'Moderate',
      'Moderate',
      'Regularly Active',
      'Highly Active',
    )!;
    const farCivic = computePoliticalAlignmentScore(
      'Moderate',
      'Moderate',
      'Not Active',
      'Highly Active',
    )!;

    expect(withoutCivic).toBe(100);
    expect(closeCivic).toBeLessThan(withoutCivic);
    expect(farCivic).toBeLessThan(closeCivic);
  });

  it('returns null for an unrecognized orientation value', () => {
    expect(computePoliticalAlignmentScore('Not A Real Value', 'Moderate', null, null)).toBeNull();
  });
});
