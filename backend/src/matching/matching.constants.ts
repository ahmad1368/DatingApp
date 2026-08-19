export const ANSWER_IMPORTANCE_WEIGHTS = {
  IRRELEVANT: 0,
  A_LITTLE_IMPORTANT: 1,
  SOMEWHAT_IMPORTANT: 10,
  VERY_IMPORTANT: 50,
  MANDATORY: 250,
} as const;

export type AnswerImportance = keyof typeof ANSWER_IMPORTANCE_WEIGHTS;

export const ANSWER_IMPORTANCE_LEVELS = Object.keys(
  ANSWER_IMPORTANCE_WEIGHTS,
) as AnswerImportance[];
