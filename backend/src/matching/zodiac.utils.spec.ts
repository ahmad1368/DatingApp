import {
  computeZodiacCompatibilityScore,
  computeZodiacHarmony,
  getZodiacElement,
  getZodiacSign,
} from './zodiac.utils';

function utcDate(month: number, day: number, year = 2000): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('getZodiacSign', () => {
  it.each([
    ['Capricorn', utcDate(1, 1)],
    ['Capricorn', utcDate(1, 19)],
    ['Aquarius', utcDate(1, 20)],
    ['Aquarius', utcDate(2, 18)],
    ['Pisces', utcDate(2, 19)],
    ['Pisces', utcDate(3, 20)],
    ['Aries', utcDate(3, 21)],
    ['Aries', utcDate(4, 19)],
    ['Taurus', utcDate(4, 20)],
    ['Gemini', utcDate(5, 21)],
    ['Cancer', utcDate(6, 21)],
    ['Leo', utcDate(7, 23)],
    ['Virgo', utcDate(8, 23)],
    ['Libra', utcDate(9, 23)],
    ['Scorpio', utcDate(10, 23)],
    ['Sagittarius', utcDate(11, 22)],
    ['Capricorn', utcDate(12, 22)],
    ['Capricorn', utcDate(12, 31)],
  ])('returns %s for %s', (expectedSign, date) => {
    expect(getZodiacSign(date)).toBe(expectedSign);
  });
});

describe('computeZodiacHarmony', () => {
  it('rates the same sign as highly compatible', () => {
    expect(computeZodiacHarmony('Leo', 'Leo')).toBe('Highly Compatible');
  });

  it('rates the same element as highly compatible', () => {
    expect(computeZodiacHarmony('Aries', 'Leo')).toBe('Highly Compatible');
  });

  it('rates fire and air as compatible', () => {
    expect(computeZodiacHarmony('Aries', 'Gemini')).toBe('Compatible');
  });

  it('rates earth and water as compatible', () => {
    expect(computeZodiacHarmony('Taurus', 'Cancer')).toBe('Compatible');
  });

  it('rates fire and earth as challenging', () => {
    expect(computeZodiacHarmony('Aries', 'Taurus')).toBe('Challenging, But Possible');
  });
});

describe('getZodiacElement', () => {
  it.each([
    ['Fire', 'Aries'],
    ['Fire', 'Leo'],
    ['Fire', 'Sagittarius'],
    ['Earth', 'Taurus'],
    ['Earth', 'Virgo'],
    ['Earth', 'Capricorn'],
    ['Air', 'Gemini'],
    ['Air', 'Libra'],
    ['Air', 'Aquarius'],
    ['Water', 'Cancer'],
    ['Water', 'Scorpio'],
    ['Water', 'Pisces'],
  ] as const)('returns %s for %s', (expectedElement, sign) => {
    expect(getZodiacElement(sign)).toBe(expectedElement);
  });
});

describe('computeZodiacCompatibilityScore', () => {
  it('scores the same sign the highest', () => {
    expect(computeZodiacCompatibilityScore('Leo', 'Leo')).toBe(90);
  });

  it('scores the same element as highly compatible', () => {
    expect(computeZodiacCompatibilityScore('Aries', 'Leo')).toBe(90);
  });

  it('scores a harmonious element pair (fire/air) above a challenging one', () => {
    const harmonious = computeZodiacCompatibilityScore('Aries', 'Gemini');
    const challenging = computeZodiacCompatibilityScore('Aries', 'Taurus');

    expect(harmonious).toBe(70);
    expect(challenging).toBe(45);
    expect(harmonious).toBeGreaterThan(challenging);
  });
});
