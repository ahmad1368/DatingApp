export const FIRST_MESSAGE_WINDOW_HOURS = 24;

export const WOMAN_GENDER_IDENTITIES = ['Woman', 'Transgender Woman'];

export const MEDIA_CONTENT_TYPES = ['IMAGE', 'GIF'] as const;

export const DEFAULT_GIF_SEARCH_LIMIT = 20;
export const MAX_GIF_SEARCH_LIMIT = 50;

export function computeFirstMessageExpiresAt(from: Date): Date {
  return new Date(from.getTime() + FIRST_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isWoman(genderIdentities: string[]): boolean {
  return genderIdentities.some((identity) => WOMAN_GENDER_IDENTITIES.includes(identity));
}
