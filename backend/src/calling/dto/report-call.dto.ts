import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { USER_REPORT_REASONS } from '../../safety/safety.constants';

export class ReportCallDto {
  @IsIn(USER_REPORT_REASONS)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  details?: string;
}
