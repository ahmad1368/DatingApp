export interface OpeningQuestion {
  id: string;
  question: string;
}

// Displayed on the profile header (see OpeningQuestionService) so a match
// can reply to something specific instead of opening with a generic "hey" -
// curated and static, same "no admin tooling yet" shape as ICEBREAKER_PROMPTS.
export const OPENING_QUESTIONS: OpeningQuestion[] = [
  { id: 'first-question', question: "What's the first thing you'd want to know about me?" },
  { id: 'perfect-day', question: 'What would our perfect first date look like?' },
  { id: 'unpopular-opinion', question: "What's your most unpopular opinion?" },
  { id: 'karaoke-song', question: "What's your go-to karaoke song?" },
  { id: 'best-story', question: "What's the best story you have to tell?" },
  { id: 'compliment-me', question: 'Pick a photo and tell me what you like about it.' },
  { id: 'convince-me', question: 'Convince me to try your favorite food.' },
  { id: 'two-truths', question: 'Guess one thing about me from my profile.' },
];

export function findOpeningQuestion(questionId: string): OpeningQuestion | undefined {
  return OPENING_QUESTIONS.find((question) => question.id === questionId);
}
