export const SMOKING_HABITS = ['Never', 'Occasionally', 'Regularly', 'Trying to Quit'] as const;

export const DRINKING_HABITS = ['Never', 'Socially', 'Regularly'] as const;

export const EDUCATION_LEVELS = [
  'High School',
  'Some College',
  'Trade School',
  'Bachelors',
  'Masters',
  'Doctorate',
] as const;

export const RELIGIONS = [
  'Agnostic',
  'Atheist',
  'Buddhist',
  'Christian',
  'Hindu',
  'Jewish',
  'Muslim',
  'Spiritual',
  'Other',
  'Prefer Not to Say',
] as const;

// How observant someone is within their stated religion (or spiritual
// practice) - a separate axis from RELIGIONS itself, since two people who
// share a religion can differ widely on how central it is to daily life.
export const RELIGIOUS_PRACTICE_LEVELS = [
  'Not Practicing',
  'Culturally Only',
  'Somewhat Practicing',
  'Very Practicing',
  'Prefer Not to Say',
] as const;

export const DIETARY_PREFERENCES = [
  'Omnivore',
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Kosher',
  'Halal',
  'Other',
] as const;

export const CHILDREN_PREFERENCES = [
  'Wants Children',
  'Open to Children',
  'Does Not Want Children',
  'Has Children & Wants More',
  'Has Children & Content',
] as const;

export const MAX_FILTER_SELECTIONS = 10;

export const WORKOUT_HABITS = ['Never', 'Sometimes', 'Often', 'Daily'] as const;

export const PET_OWNERSHIP_OPTIONS = [
  'No Pets',
  'Dog',
  'Cat',
  'Dog & Cat',
  'Other Pet',
  'Pet-Free but Love Them',
] as const;

export const PET_ALLERGY_STATUS_OPTIONS = ['Allergy Free', 'Has Pet Allergies'] as const;

export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 250;

// Ordered left-to-right on the ideological spectrum used by
// computePoliticalAlignmentScore - the array position (not the label) is
// what the distance calculation is based on, so reordering these changes
// scoring. Apolitical/Prefer Not to Say fall outside the spectrum entirely.
export const POLITICAL_ORIENTATIONS = [
  'Progressive',
  'Liberal',
  'Moderate',
  'Conservative',
  'Libertarian',
  'Apolitical',
  'Prefer Not to Say',
] as const;

// Ordered from least to most engaged - array position drives the civic
// engagement closeness component of computePoliticalAlignmentScore.
export const CIVIC_ACTIVITY_LEVELS = [
  'Not Active',
  'Occasionally Active',
  'Regularly Active',
  'Highly Active',
] as const;
