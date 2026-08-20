export const CONTENT_MODERATOR = Symbol('CONTENT_MODERATOR');

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

export interface ContentModerator {
  moderate(text: string): Promise<ModerationResult>;
}
