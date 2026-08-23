import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { MATCH_QUALITY_RATINGS } from '../post-match-survey.constants';

export class SubmitPostMatchSurveyDto {
  @IsBoolean()
  metInPerson!: boolean;

  /** Required (and only meaningful) when metInPerson is true. */
  @IsOptional()
  @IsIn(MATCH_QUALITY_RATINGS)
  matchQuality?: string;
}
