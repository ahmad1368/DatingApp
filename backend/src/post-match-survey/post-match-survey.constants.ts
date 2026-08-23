export const MATCH_QUALITY_RATINGS = ['GREAT', 'GOOD', 'OK', 'POOR'] as const;

export type MatchQualityRating = (typeof MATCH_QUALITY_RATINGS)[number];
