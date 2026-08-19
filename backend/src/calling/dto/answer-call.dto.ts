import { IsString, MinLength } from 'class-validator';

export class AnswerCallDto {
  @IsString()
  @MinLength(1)
  answerSdp!: string;
}
