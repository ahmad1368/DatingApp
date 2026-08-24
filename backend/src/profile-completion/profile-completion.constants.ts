export interface CompletionCheck {
  id: string;
  label: string;
  weight: number;
}

/**
 * Weighted checklist for the profile completion meter. Weights sum to 100
 * so the total score is directly a percentage.
 */
export const COMPLETION_CHECKS: CompletionCheck[] = [
  { id: 'name', label: 'Add your name', weight: 10 },
  { id: 'dateOfBirth', label: 'Add your date of birth', weight: 5 },
  { id: 'genderIdentity', label: 'Add your gender identity', weight: 5 },
  { id: 'relationshipGoal', label: 'Set what you are looking for', weight: 10 },
  { id: 'interests', label: 'Add at least 3 interests', weight: 10 },
  { id: 'photos', label: 'Add at least 3 profile photos', weight: 25 },
  { id: 'voiceIntro', label: 'Record a voice intro', weight: 15 },
  { id: 'promptAnswer', label: 'Answer a profile prompt', weight: 10 },
  { id: 'linkedAccount', label: 'Link Instagram or Spotify', weight: 10 },
];

export const MIN_INTERESTS_FOR_CREDIT = 3;
export const MIN_PHOTOS_FOR_CREDIT = 3;
