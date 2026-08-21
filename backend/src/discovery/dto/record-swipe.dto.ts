import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { SWIPE_ACTIONS } from '../discovery.constants';

export class RecordSwipeDto {
  @IsUUID()
  targetUserId!: string;

  @IsIn(SWIPE_ACTIONS)
  action!: string;

  /** A short pre-match compliment, e.g. praising a specific photo or prompt. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  complimentText?: string;

  /**
   * Freeform label for what the compliment is about ("your hiking photo",
   * "your travel prompt") - there's no structured photo-gallery or
   * profile-prompt model in this codebase to reference by id.
   */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  complimentTarget?: string;
}
