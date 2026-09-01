import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { MAX_PROMPT_VOICE_SECONDS, MAX_VOICE_PROMPT_REACTION_COMMENT_LENGTH } from '../profile-prompts.constants';

export class ReactToPhotoDto {
  @IsUUID()
  targetUserId!: string;

  @IsOptional()
  @IsString()
  @Length(1, MAX_VOICE_PROMPT_REACTION_COMMENT_LENGTH)
  comment?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  audioReplyUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PROMPT_VOICE_SECONDS)
  durationSeconds?: number;
}
