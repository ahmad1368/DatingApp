import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { SCAM_AWARENESS_QUIZ } from '../safety.constants';

export class ScamQuizAnswerDto {
  @IsString()
  questionId!: string;

  @IsBoolean()
  guessIsScam!: boolean;
}

export class SubmitScamQuizDto {
  @IsArray()
  @ArrayMinSize(SCAM_AWARENESS_QUIZ.length)
  @ArrayMaxSize(SCAM_AWARENESS_QUIZ.length)
  @ValidateNested({ each: true })
  @Type(() => ScamQuizAnswerDto)
  answers!: ScamQuizAnswerDto[];
}
