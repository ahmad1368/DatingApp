import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { RELATIONSHIP_GOALS } from '../onboarding.constants';

export class CompleteOnboardingDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  @Length(1, 50)
  gender!: string;

  @IsIn(RELATIONSHIP_GOALS)
  relationshipGoal!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 30, { each: true })
  interests!: string[];
}
