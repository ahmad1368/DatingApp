import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, Length, ValidateNested } from 'class-validator';
import { MAX_ANSWER_LENGTH, MAX_PROMPTS, MIN_PROMPTS, PROMPT_QUESTIONS } from '../profile-prompts.constants';

export class ProfilePromptItemDto {
  @IsIn(PROMPT_QUESTIONS)
  question!: string;

  @IsString()
  @Length(1, MAX_ANSWER_LENGTH)
  answer!: string;
}

export class SetProfilePromptsDto {
  @IsArray()
  @ArrayMinSize(MIN_PROMPTS)
  @ArrayMaxSize(MAX_PROMPTS)
  @ValidateNested({ each: true })
  @Type(() => ProfilePromptItemDto)
  prompts!: ProfilePromptItemDto[];
}
