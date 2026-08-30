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
  /**
   * The match's own profile prompt answers (question + transcribed voice
   * answer - see ProfilePromptsService), so a conversation opener can
   * reference something specific they actually said rather than only
   * generic shared interests. Empty when no matchId was given or they
   * haven't answered any prompts.
   */
  matchProfilePromptAnswers: { question: string; answer: string }[];
}

export interface CoachSuggestions {
  conversationOpeners: string[];
  dateIdeas: string[];
  profileTips: string[];
}

export interface AiCoachProvider {
  generateSuggestions(context: CoachEngagementContext): Promise<CoachSuggestions>;
}
