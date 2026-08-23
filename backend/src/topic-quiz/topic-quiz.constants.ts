export const TOPIC_QUIZ_CATEGORIES = ['Political', 'Cultural', 'Lifestyle'] as const;

export type TopicQuizCategory = (typeof TOPIC_QUIZ_CATEGORIES)[number];

export const TOPIC_QUIZ_STANCES = ['AGREE', 'NEUTRAL', 'DISAGREE'] as const;

export type TopicQuizStance = (typeof TOPIC_QUIZ_STANCES)[number];

export interface TopicQuizQuestion {
  id: string;
  category: TopicQuizCategory;
  statement: string;
}

/**
 * Distinct from the personality test's Likert-scale traits: these are
 * discrete stances on specific political, cultural, and lifestyle topics,
 * meant to be compared side by side as agree/disagree indicators rather
 * than as a continuous similarity score.
 */
export const TOPIC_QUIZ_QUESTIONS: TopicQuizQuestion[] = [
  { id: 'climate-policy', category: 'Political', statement: 'Government should take an active role in fighting climate change.' },
  { id: 'universal-healthcare', category: 'Political', statement: 'Healthcare should be a guaranteed government-provided service.' },
  { id: 'immigration-openness', category: 'Political', statement: 'Immigration policy should be more open, not more restrictive.' },
  { id: 'gun-regulation', category: 'Political', statement: 'Stricter gun control laws would make society safer.' },
  { id: 'religion-in-parenting', category: 'Cultural', statement: 'Religion should play a central role in how a couple raises children.' },
  { id: 'traditional-gender-roles', category: 'Cultural', statement: 'Traditional gender roles still make sense in a relationship.' },
  { id: 'astrology-belief', category: 'Cultural', statement: 'Astrology says something meaningful about compatibility.' },
  { id: 'monogamy-only', category: 'Cultural', statement: 'Monogamy is the only acceptable relationship structure.' },
  { id: 'big-wedding', category: 'Lifestyle', statement: 'A big, traditional wedding is important to me.' },
  { id: 'kids-are-a-must', category: 'Lifestyle', statement: 'Having children is a must for my future.' },
  { id: 'city-over-rural', category: 'Lifestyle', statement: 'City living beats a quiet rural or suburban life.' },
  { id: 'relocate-for-partner', category: 'Lifestyle', statement: "I'd relocate for a partner's career before my own." },
];

const CATEGORY_BY_QUESTION_ID = new Map(
  TOPIC_QUIZ_QUESTIONS.map((question) => [question.id, question.category]),
);

export function categoryForQuestion(questionId: string): TopicQuizCategory | 'Other' {
  return CATEGORY_BY_QUESTION_ID.get(questionId) ?? 'Other';
}
