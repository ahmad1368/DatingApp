import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';
import { MAX_LIKERT_SCORE, MIN_LIKERT_SCORE, PERSONALITY_TEST_ITEMS } from '../personality-test.constants';

export class PersonalityTestResponseDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(MIN_LIKERT_SCORE)
  @Max(MAX_LIKERT_SCORE)
  score!: number;
}

export class SubmitPersonalityTestDto {
  @IsArray()
  @ArrayMinSize(PERSONALITY_TEST_ITEMS.length)
  @ArrayMaxSize(PERSONALITY_TEST_ITEMS.length)
  @ValidateNested({ each: true })
  @Type(() => PersonalityTestResponseDto)
  responses!: PersonalityTestResponseDto[];
}
