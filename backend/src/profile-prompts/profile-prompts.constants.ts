export interface ProfilePrompt {
  id: string;
  question: string;
}

export const MAX_PROMPT_VOICE_SECONDS = 60;

export const PROFILE_PROMPTS: ProfilePrompt[] = [
  { id: 'perfect-first-date', question: 'My idea of a perfect first date is...' },
  { id: 'unpopular-opinion', question: 'A controversial opinion I have is...' },
  { id: 'weekend-recharge', question: 'The best way to recharge on a weekend is...' },
  { id: 'go-to-karaoke-song', question: 'My go-to karaoke song is...' },
  { id: 'life-motto', question: 'A phrase I live by is...' },
  { id: 'best-trip', question: 'The best trip I have ever taken was...' },
  { id: 'guilty-pleasure', question: 'My guilty pleasure is...' },
  { id: 'green-flag', question: 'A green flag I look for in a partner is...' },
];

export function findProfilePrompt(promptId: string): ProfilePrompt | undefined {
  return PROFILE_PROMPTS.find((prompt) => prompt.id === promptId);
}
