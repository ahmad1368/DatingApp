import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_VISIBILITY_HOUR_UTC, MIN_VISIBILITY_HOUR_UTC } from '../discovery.constants';

export class SetVisibilityScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(MIN_VISIBILITY_HOUR_UTC)
  @Max(MAX_VISIBILITY_HOUR_UTC)
  hiddenStartHourUtc?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_VISIBILITY_HOUR_UTC)
  @Max(MAX_VISIBILITY_HOUR_UTC)
  hiddenEndHourUtc?: number;
}
