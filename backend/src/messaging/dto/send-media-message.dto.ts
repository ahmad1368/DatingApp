import { IsIn, IsInt, IsOptional, IsUrl, Max, Min } from 'class-validator';
import {
  EXPIRY_MODES,
  ExpiryMode,
  MAX_VIDEO_REACTION_SECONDS,
  MAX_VIEW_TIMER_SECONDS,
  MEDIA_CONTENT_TYPES,
  MIN_VIEW_TIMER_SECONDS,
} from '../messaging.constants';

export class SendMediaMessageDto {
  @IsIn(MEDIA_CONTENT_TYPES)
  contentType!: string;

  @IsUrl()
  mediaUrl!: string;

  @IsOptional()
  @IsIn(EXPIRY_MODES)
  expiryMode?: ExpiryMode;

  /** Required (and only meaningful) when expiryMode is 'TIMER'. */
  @IsOptional()
  @IsInt()
  @Min(MIN_VIEW_TIMER_SECONDS)
  @Max(MAX_VIEW_TIMER_SECONDS)
  viewTimerSeconds?: number;

  /** Required (and only meaningful) when contentType is 'VIDEO_REACTION'. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_REACTION_SECONDS)
  durationSeconds?: number;
}
