import { ModerationResult } from './content-moderator.interface';

export const IMAGE_MODERATOR = Symbol('IMAGE_MODERATOR');

export interface ImageModerator {
  moderate(mediaUrl: string): Promise<ModerationResult>;
}
