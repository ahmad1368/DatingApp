export const AI_COACH_PROVIDER = Symbol('AI_COACH_PROVIDER');

export interface CoachEngagementContext {
  totalMatches: number;
  staleMatchesCount: number;
  messagesSent: number;
  messagesReceived: number;
  missingProfileFields: string[];
  sharedInterestsWithMatch: string[];
}

export interface CoachSuggestions {
  conversationOpeners: string[];
  dateIdeas: string[];
  profileTips: string[];
}

export interface AiCoachProvider {
  generateSuggestions(context: CoachEngagementContext): Promise<CoachSuggestions>;
}
