import { IsIn, IsOptional } from 'class-validator';
import { UNMATCH_REASONS } from '../messaging.constants';

export class UnmatchDto {
  /** Internal-only quick-pick tag for moderation monitoring - see MessagingService.unmatch. */
  @IsOptional()
  @IsIn(UNMATCH_REASONS)
  reason?: string;
}
