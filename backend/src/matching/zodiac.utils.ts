export const ZODIAC_SIGNS = [
  'Capricorn',
  'Aquarius',
  'Pisces',
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

type ZodiacElement = 'Fire' | 'Earth' | 'Air' | 'Water';

const ZODIAC_ELEMENTS: Record<ZodiacSign, ZodiacElement> = {
  Aries: 'Fire',
  Leo: 'Fire',
  Sagittarius: 'Fire',
  Taurus: 'Earth',
  Virgo: 'Earth',
  Capricorn: 'Earth',
  Gemini: 'Air',
  Libra: 'Air',
  Aquarius: 'Air',
  Cancer: 'Water',
  Scorpio: 'Water',
  Pisces: 'Water',
};

// (month, day) each sign's date range begins on, in calendar order starting
// from Jan 1 - the range "wraps" because Capricorn spans the year boundary
// (Dec 22 - Jan 19).
const ZODIAC_RANGE_STARTS: { sign: ZodiacSign; month: number; day: number }[] = [
  { sign: 'Capricorn', month: 1, day: 1 },
  { sign: 'Aquarius', month: 1, day: 20 },
  { sign: 'Pisces', month: 2, day: 19 },
  { sign: 'Aries', month: 3, day: 21 },
  { sign: 'Taurus', month: 4, day: 20 },
  { sign: 'Gemini', month: 5, day: 21 },
  { sign: 'Cancer', month: 6, day: 21 },
  { sign: 'Leo', month: 7, day: 23 },
  { sign: 'Virgo', month: 8, day: 23 },
  { sign: 'Libra', month: 9, day: 23 },
  { sign: 'Scorpio', month: 10, day: 23 },
  { sign: 'Sagittarius', month: 11, day: 22 },
  { sign: 'Capricorn', month: 12, day: 22 },
];

/** Western zodiac sign for a birth date, based on calendar month/day (UTC). */
export function getZodiacSign(dateOfBirth: Date): ZodiacSign {
  const month = dateOfBirth.getUTCMonth() + 1;
  const day = dateOfBirth.getUTCDate();

  let sign: ZodiacSign = ZODIAC_RANGE_STARTS[0].sign;
  for (const range of ZODIAC_RANGE_STARTS) {
    if (month > range.month || (month === range.month && day >= range.day)) {
      sign = range.sign;
    }
  }
  return sign;
}

const HARMONIOUS_ELEMENT_PAIRS: [ZodiacElement, ZodiacElement][] = [
  ['Fire', 'Air'],
  ['Earth', 'Water'],
];

/**
 * A simple astrological-harmony heuristic based on element groupings, not a
 * substitute for a full natal chart: same sign or element is "Highly
 * Compatible", the classically complementary element pairs (fire+air,
 * earth+water) are "Compatible", everything else is "Challenging, But
 * Possible".
 */
export function computeZodiacHarmony(signA: ZodiacSign, signB: ZodiacSign): string {
  if (signA === signB) {
    return 'Highly Compatible';
  }

  const elementA = ZODIAC_ELEMENTS[signA];
  const elementB = ZODIAC_ELEMENTS[signB];
  if (elementA === elementB) {
    return 'Highly Compatible';
  }
  if (
    HARMONIOUS_ELEMENT_PAIRS.some(
      ([x, y]) => (elementA === x && elementB === y) || (elementA === y && elementB === x),
    )
  ) {
    return 'Compatible';
  }
  return 'Challenging, But Possible';
}
