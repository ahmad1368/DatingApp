import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { APPLICATION_DECISIONS, MAX_DECISION_REASON_LENGTH } from '../vetting.constants';

export class DecideApplicationDto {
  @IsIn(APPLICATION_DECISIONS)
  decision!: string;

  @IsOptional()
  @IsString()
  @Length(1, MAX_DECISION_REASON_LENGTH)
  reason?: string;
}
