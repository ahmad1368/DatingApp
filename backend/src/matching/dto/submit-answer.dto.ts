import { ArrayNotEmpty, IsArray, IsIn, IsString, IsUUID } from 'class-validator';
import { ANSWER_IMPORTANCE_LEVELS } from '../matching.constants';

export class SubmitAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  answer!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  acceptableAnswers!: string[];

  @IsIn(ANSWER_IMPORTANCE_LEVELS)
  importance!: string;
}
