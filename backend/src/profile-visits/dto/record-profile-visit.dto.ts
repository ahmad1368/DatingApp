import { IsBoolean, IsOptional } from 'class-validator';

export class RecordProfileVisitDto {
  /** Premium-only: skip recording this visit entirely. */
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}
