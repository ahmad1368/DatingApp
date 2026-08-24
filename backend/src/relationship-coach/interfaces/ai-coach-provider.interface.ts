export const AI_COACH_PROVIDER = Symbol('AI_COACH_PROVIDER');

export interface CoachEngagementContext {
  totalMatches: number;
  staleMatchesCount: number;
  messagesSent: number;
  messagesReceived: number;
  missingProfileFields: string[];
  sharedInterestsWithMatch: string[];
  /** Compatibility questionnaire questions both sides of the match answered - see MatchingService.getCompatibility. */
  sharedQuestionCount: number;
  /** Questionnaire-based compatibility score (0-100), or null if there's no overlap to score. */
  compatibilityPercentage: number | null;
}

export interface CoachSuggestions {
  conversationOpeners: string[];
  dateIdeas: string[];
  profileTips: string[];
}

export interface AiCoachProvider {
  generateSuggestions(context: CoachEngagementContext): Promise<CoachSuggestions>;
}
