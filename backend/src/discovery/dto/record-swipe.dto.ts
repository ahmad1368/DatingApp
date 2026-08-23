import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
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

  /**
   * A dual-choice icebreaker (from messaging's ICEBREAKER_PROMPTS catalog)
   * answered while liking, so a match can open with both answers already
   * compared instead of an empty chat. Requires icebreakerOptionIndex too.
   */
  @IsOptional()
  @IsString()
  icebreakerPromptId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  icebreakerOptionIndex?: number;
}
