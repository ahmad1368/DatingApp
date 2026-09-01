import { IsString } from 'class-validator';

export class SetOpeningQuestionDto {
  @IsString()
  questionId!: string;
}
