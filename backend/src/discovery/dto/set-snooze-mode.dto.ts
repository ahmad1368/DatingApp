import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class SetSnoozeModeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsISO8601()
  until?: string;
}
