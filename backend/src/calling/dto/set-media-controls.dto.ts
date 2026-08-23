import { IsBoolean, IsOptional } from 'class-validator';

export class SetMediaControlsDto {
  @IsOptional()
  @IsBoolean()
  muted?: boolean;

  @IsOptional()
  @IsBoolean()
  videoEnabled?: boolean;
}
