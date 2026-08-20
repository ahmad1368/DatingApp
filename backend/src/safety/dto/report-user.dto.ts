import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { USER_REPORT_REASONS } from '../safety.constants';

export class ReportUserDto {
  @IsUUID()
  reportedUserId!: string;

  @IsIn(USER_REPORT_REASONS)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  details?: string;
}
