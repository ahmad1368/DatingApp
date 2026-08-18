export const RELATIONSHIP_GOALS = ['LONG_TERM', 'CASUAL', 'FRIENDSHIP', 'NOT_SURE'] as const;

export type RelationshipGoal = (typeof RELATIONSHIP_GOALS)[number];

export const MINIMUM_AGE_YEARS = 18;
