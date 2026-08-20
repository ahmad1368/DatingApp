export const FIRST_MESSAGE_WINDOW_HOURS = 24;

export const WOMAN_GENDER_IDENTITIES = ['Woman', 'Transgender Woman'];

export const MEDIA_CONTENT_TYPES = ['IMAGE', 'GIF'] as const;

export const DEFAULT_GIF_SEARCH_LIMIT = 20;
export const MAX_GIF_SEARCH_LIMIT = 50;

export interface IcebreakerPrompt {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
}

// A two-option question card either person can send in-chat to spark
// conversation before meeting. Curated and static - no admin tooling exists
// to manage this content yet, so it lives in code like SAFETY_RESOURCES.
export const ICEBREAKER_PROMPTS: IcebreakerPrompt[] = [
  { id: 'morning-or-night', question: 'Morning person or night owl?', optionA: 'Morning person', optionB: 'Night owl' },
  { id: 'beach-or-mountains', question: 'Dream vacation?', optionA: 'Beach', optionB: 'Mountains' },
  { id: 'coffee-or-tea', question: 'Coffee or tea?', optionA: 'Coffee', optionB: 'Tea' },
  { id: 'dogs-or-cats', question: 'Dog person or cat person?', optionA: 'Dogs', optionB: 'Cats' },
  { id: 'homebody-or-adventurer', question: 'Ideal Friday night?', optionA: 'Cozy night in', optionB: 'Out on an adventure' },
  { id: 'planner-or-spontaneous', question: 'Planner or spontaneous?', optionA: 'Plan everything out', optionB: 'Go with the flow' },
  { id: 'sweet-or-savory', question: 'Sweet or savory?', optionA: 'Sweet', optionB: 'Savory' },
  { id: 'texter-or-caller', question: 'Texter or caller?', optionA: 'Texting', optionB: 'Phone calls' },
];

export function findIcebreakerPrompt(promptId: string): IcebreakerPrompt | undefined {
  return ICEBREAKER_PROMPTS.find((prompt) => prompt.id === promptId);
}

export function computeFirstMessageExpiresAt(from: Date): Date {
  return new Date(from.getTime() + FIRST_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isWoman(genderIdentities: string[]): boolean {
  return genderIdentities.some((identity) => WOMAN_GENDER_IDENTITIES.includes(identity));
}
