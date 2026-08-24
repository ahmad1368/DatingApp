import { IsInt, Max, Min } from 'class-validator';
import { MAX_POLL_OPTIONS } from '../messaging.constants';

export class RespondPollDto {
  @IsInt()
  @Min(0)
  @Max(MAX_POLL_OPTIONS - 1)
  optionIndex!: number;
}
