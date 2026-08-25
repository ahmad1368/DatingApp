import { applyDeckFeedback, MAX_PROXIMITY_WEIGHT, MIN_PROXIMITY_WEIGHT } from './discovery.constants';

describe('applyDeckFeedback', () => {
  it('nudges the weight up for a BAD rating', () => {
    expect(applyDeckFeedback(1, 'BAD')).toBeCloseTo(1.3, 5);
  });

  it('nudges the weight up a little for an OKAY rating', () => {
    expect(applyDeckFeedback(1, 'OKAY')).toBeCloseTo(1.15, 5);
  });

  it('eases the weight back down for a GOOD rating', () => {
    expect(applyDeckFeedback(1, 'GOOD')).toBeCloseTo(0.9, 5);
  });

  it('never exceeds the maximum weight', () => {
    expect(applyDeckFeedback(MAX_PROXIMITY_WEIGHT, 'BAD')).toBe(MAX_PROXIMITY_WEIGHT);
  });

  it('never drops below the minimum weight', () => {
    expect(applyDeckFeedback(MIN_PROXIMITY_WEIGHT, 'GOOD')).toBe(MIN_PROXIMITY_WEIGHT);
  });
});
