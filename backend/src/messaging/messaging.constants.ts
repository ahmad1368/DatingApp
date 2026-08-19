export const FIRST_MESSAGE_WINDOW_HOURS = 24;

export const WOMAN_GENDER_IDENTITIES = ['Woman', 'Transgender Woman'];

export function computeFirstMessageExpiresAt(from: Date): Date {
  return new Date(from.getTime() + FIRST_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isWoman(genderIdentities: string[]): boolean {
  return genderIdentities.some((identity) => WOMAN_GENDER_IDENTITIES.includes(identity));
}
