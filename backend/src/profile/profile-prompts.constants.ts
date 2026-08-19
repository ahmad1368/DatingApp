export const PROMPT_QUESTIONS = [
  'My simple pleasures are',
  'Two truths and a lie',
  'My ideal first date is',
  'A life goal of mine',
  'The way to win me over is',
  "I'm overly competitive about",
  'My most controversial opinion is',
  'Typical Sunday',
  'I go crazy for',
  'Green flags I look for',
  'My love language is',
  'Together we could',
  'Best travel story',
  "I'm looking for",
  'Dating me is like',
] as const;

export type PromptQuestion = (typeof PROMPT_QUESTIONS)[number];

export const MIN_PROMPTS = 3;
export const MAX_PROMPTS = 5;
export const MAX_ANSWER_LENGTH = 300;
