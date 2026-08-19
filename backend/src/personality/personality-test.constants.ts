export interface PersonalityTestItem {
  id: string;
  dimension: string;
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
  { id: 'emotional-stability', dimension: 'Emotional Stability', statement: 'I stay calm and level-headed even when things go wrong.', reverseScored: false },
  { id: 'optimism', dimension: 'Optimism', statement: 'I generally expect good things to happen.', reverseScored: false },
  { id: 'resilience-under-stress', dimension: 'Resilience Under Stress', statement: 'Setbacks tend to derail me for a long time.', reverseScored: true },
  { id: 'emotional-expressiveness', dimension: 'Emotional Expressiveness', statement: 'I openly show how I feel to people close to me.', reverseScored: false },
  { id: 'empathy', dimension: 'Empathy', statement: 'I easily pick up on how other people are feeling.', reverseScored: false },
  { id: 'self-awareness', dimension: 'Self-Awareness', statement: 'I understand why I react the way I do in most situations.', reverseScored: false },
  { id: 'impulse-control', dimension: 'Impulse Control', statement: 'I often act before thinking things through.', reverseScored: true },
  { id: 'warmth', dimension: 'Warmth', statement: 'People would describe me as warm and approachable.', reverseScored: false },

  // Core values
  { id: 'family-orientation', dimension: 'Family Orientation', statement: 'Building a close family life is one of my top priorities.', reverseScored: false },
  { id: 'career-ambition', dimension: 'Career Ambition', statement: 'Professional achievement is a central part of who I am.', reverseScored: false },
  { id: 'financial-prudence', dimension: 'Financial Prudence', statement: 'I carefully plan and save rather than spend impulsively.', reverseScored: false },
  { id: 'spirituality', dimension: 'Spirituality', statement: 'Spiritual or religious belief plays an important role in my life.', reverseScored: false },
  { id: 'social-justice-commitment', dimension: 'Social Justice Commitment', statement: 'I actively care about fairness and equality in society.', reverseScored: false },
  { id: 'tradition-vs-progressivism', dimension: 'Tradition vs Progressivism', statement: 'I prefer tried-and-true traditions over new social norms.', reverseScored: false },
  { id: 'adventurousness', dimension: 'Adventurousness', statement: 'I seek out new and unfamiliar experiences whenever I can.', reverseScored: false },
  { id: 'environmental-consciousness', dimension: 'Environmental Consciousness', statement: 'I make everyday choices with the environment in mind.', reverseScored: false },

  // Communication style
  { id: 'directness', dimension: 'Directness', statement: "I say what I mean rather than hinting at it.", reverseScored: false },
  { id: 'active-listening', dimension: 'Active Listening', statement: 'I find myself planning my response instead of fully listening.', reverseScored: true },
  { id: 'conflict-resolution-style', dimension: 'Conflict Resolution Style', statement: 'I address disagreements head-on rather than avoiding them.', reverseScored: false },
  { id: 'humor-compatibility', dimension: 'Humor Compatibility', statement: 'Humor and playfulness are a big part of how I connect with people.', reverseScored: false },
  { id: 'affection-expression', dimension: 'Affection Expression', statement: 'I regularly tell people close to me how much they mean to me.', reverseScored: false },
  { id: 'assertiveness', dimension: 'Assertiveness', statement: 'I struggle to speak up when I disagree with someone.', reverseScored: true },
  { id: 'openness-to-feedback', dimension: 'Openness to Feedback', statement: 'I welcome honest feedback, even when it is critical.', reverseScored: false },
  { id: 'verbal-vs-physical-affection', dimension: 'Verbal vs Physical Affection', statement: 'I show affection more through touch than through words.', reverseScored: false },

  // Personality / social
  { id: 'openness-to-experience', dimension: 'Openness to Experience', statement: 'I enjoy exploring new ideas and unconventional viewpoints.', reverseScored: false },
  { id: 'conscientiousness', dimension: 'Conscientiousness', statement: 'I follow through on commitments even when it is inconvenient.', reverseScored: false },
  { id: 'extraversion', dimension: 'Extraversion', statement: 'Being around groups of people energizes me.', reverseScored: false },
  { id: 'agreeableness', dimension: 'Agreeableness', statement: 'I go out of my way to accommodate others, even at a cost to myself.', reverseScored: false },
  { id: 'independence', dimension: 'Independence', statement: 'I prefer figuring things out on my own over relying on others.', reverseScored: false },
  { id: 'curiosity', dimension: 'Curiosity', statement: 'I ask a lot of questions about how things work.', reverseScored: false },
  { id: 'punctuality-structure', dimension: 'Punctuality/Structure', statement: 'I like having a clear plan rather than leaving things open-ended.', reverseScored: false },
  { id: 'spontaneity', dimension: 'Spontaneity', statement: 'I would rather plan carefully than do things on a whim.', reverseScored: true },
];

export const PERSONALITY_DIMENSIONS = PERSONALITY_TEST_ITEMS.map((item) => item.dimension);
