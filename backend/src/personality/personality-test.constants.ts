export interface PersonalityTestItem {
  id: string;
  dimension: string;
  category: string;
  statement: string;
  reverseScored: boolean;
}

export const MIN_LIKERT_SCORE = 1;
export const MAX_LIKERT_SCORE = 5;

/**
 * 32-dimension psychometric instrument spanning emotional temperament (1-8),
 * core values (9-16), communication style (17-24), and broader
 * personality/social traits (25-32). One statement per dimension, scored on
 * a 1-5 Likert scale, some reverse-scored for balanced item wording.
 */
export const PERSONALITY_TEST_ITEMS: PersonalityTestItem[] = [
  // Emotional temperament
  { id: 'emotional-stability', dimension: 'Emotional Stability', category: 'Emotional Values', statement: 'I stay calm and level-headed even when things go wrong.', reverseScored: false },
  { id: 'optimism', dimension: 'Optimism', category: 'Emotional Values', statement: 'I generally expect good things to happen.', reverseScored: false },
  { id: 'resilience-under-stress', dimension: 'Resilience Under Stress', category: 'Emotional Values', statement: 'Setbacks tend to derail me for a long time.', reverseScored: true },
  { id: 'emotional-expressiveness', dimension: 'Emotional Expressiveness', category: 'Emotional Values', statement: 'I openly show how I feel to people close to me.', reverseScored: false },
  { id: 'empathy', dimension: 'Empathy', category: 'Emotional Values', statement: 'I easily pick up on how other people are feeling.', reverseScored: false },
  { id: 'self-awareness', dimension: 'Self-Awareness', category: 'Emotional Values', statement: 'I understand why I react the way I do in most situations.', reverseScored: false },
  { id: 'impulse-control', dimension: 'Impulse Control', category: 'Emotional Values', statement: 'I often act before thinking things through.', reverseScored: true },
  { id: 'warmth', dimension: 'Warmth', category: 'Emotional Values', statement: 'People would describe me as warm and approachable.', reverseScored: false },

  // Core values
  { id: 'family-orientation', dimension: 'Family Orientation', category: 'Core Values', statement: 'Building a close family life is one of my top priorities.', reverseScored: false },
  { id: 'career-ambition', dimension: 'Career Ambition', category: 'Core Values', statement: 'Professional achievement is a central part of who I am.', reverseScored: false },
  { id: 'financial-prudence', dimension: 'Financial Prudence', category: 'Core Values', statement: 'I carefully plan and save rather than spend impulsively.', reverseScored: false },
  { id: 'spirituality', dimension: 'Spirituality', category: 'Core Values', statement: 'Spiritual or religious belief plays an important role in my life.', reverseScored: false },
  { id: 'social-justice-commitment', dimension: 'Social Justice Commitment', category: 'Core Values', statement: 'I actively care about fairness and equality in society.', reverseScored: false },
  { id: 'tradition-vs-progressivism', dimension: 'Tradition vs Progressivism', category: 'Core Values', statement: 'I prefer tried-and-true traditions over new social norms.', reverseScored: false },
  { id: 'adventurousness', dimension: 'Adventurousness', category: 'Core Values', statement: 'I seek out new and unfamiliar experiences whenever I can.', reverseScored: false },
  { id: 'environmental-consciousness', dimension: 'Environmental Consciousness', category: 'Core Values', statement: 'I make everyday choices with the environment in mind.', reverseScored: false },

  // Communication style
  { id: 'directness', dimension: 'Directness', category: 'Communication Style', statement: "I say what I mean rather than hinting at it.", reverseScored: false },
  { id: 'active-listening', dimension: 'Active Listening', category: 'Communication Style', statement: 'I find myself planning my response instead of fully listening.', reverseScored: true },
  { id: 'conflict-resolution-style', dimension: 'Conflict Resolution Style', category: 'Communication Style', statement: 'I address disagreements head-on rather than avoiding them.', reverseScored: false },
  { id: 'humor-compatibility', dimension: 'Humor Compatibility', category: 'Communication Style', statement: 'Humor and playfulness are a big part of how I connect with people.', reverseScored: false },
  { id: 'affection-expression', dimension: 'Affection Expression', category: 'Communication Style', statement: 'I regularly tell people close to me how much they mean to me.', reverseScored: false },
  { id: 'assertiveness', dimension: 'Assertiveness', category: 'Communication Style', statement: 'I struggle to speak up when I disagree with someone.', reverseScored: true },
  { id: 'openness-to-feedback', dimension: 'Openness to Feedback', category: 'Communication Style', statement: 'I welcome honest feedback, even when it is critical.', reverseScored: false },
  { id: 'verbal-vs-physical-affection', dimension: 'Verbal vs Physical Affection', category: 'Communication Style', statement: 'I show affection more through touch than through words.', reverseScored: false },

  // Personality / social
  { id: 'openness-to-experience', dimension: 'Openness to Experience', category: 'Social Habits', statement: 'I enjoy exploring new ideas and unconventional viewpoints.', reverseScored: false },
  { id: 'conscientiousness', dimension: 'Conscientiousness', category: 'Social Habits', statement: 'I follow through on commitments even when it is inconvenient.', reverseScored: false },
  { id: 'extraversion', dimension: 'Extraversion', category: 'Social Habits', statement: 'Being around groups of people energizes me.', reverseScored: false },
  { id: 'agreeableness', dimension: 'Agreeableness', category: 'Social Habits', statement: 'I go out of my way to accommodate others, even at a cost to myself.', reverseScored: false },
  { id: 'independence', dimension: 'Independence', category: 'Social Habits', statement: 'I prefer figuring things out on my own over relying on others.', reverseScored: false },
  { id: 'curiosity', dimension: 'Curiosity', category: 'Social Habits', statement: 'I ask a lot of questions about how things work.', reverseScored: false },
  { id: 'punctuality-structure', dimension: 'Punctuality/Structure', category: 'Social Habits', statement: 'I like having a clear plan rather than leaving things open-ended.', reverseScored: false },
  { id: 'spontaneity', dimension: 'Spontaneity', category: 'Social Habits', statement: 'I would rather plan carefully than do things on a whim.', reverseScored: true },
];

export const PERSONALITY_DIMENSIONS = PERSONALITY_TEST_ITEMS.map((item) => item.dimension);

const CATEGORY_BY_DIMENSION = new Map(
  PERSONALITY_TEST_ITEMS.map((item) => [item.dimension, item.category]),
);

export function categoryForDimension(dimension: string): string {
  return CATEGORY_BY_DIMENSION.get(dimension) ?? 'Other';
}

/**
 * The four broad categories a user can weight against each other via
 * PersonalityTestService.setCategoryWeights - e.g. someone who cares more
 * about shared values than shared social habits can turn Core Values up
 * and Social Habits down, shifting how much each contributes to their
 * overall compatibility percentage with someone else.
 */
export const PERSONALITY_CATEGORIES = [...new Set(PERSONALITY_TEST_ITEMS.map((item) => item.category))];

export const DEFAULT_CATEGORY_WEIGHT = 1;
export const MIN_CATEGORY_WEIGHT = 0;
export const MAX_CATEGORY_WEIGHT = 2;
