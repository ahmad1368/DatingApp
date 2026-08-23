import { IsBoolean, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class SetSnoozeModeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsISO8601()
  until?: string;

  /** Shown to matches in active chats while snoozed, e.g. "On Vacation". */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  statusMessage?: string;
}
