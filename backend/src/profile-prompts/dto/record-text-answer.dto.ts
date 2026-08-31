import { IsNotEmpty, IsString, Length } from 'class-validator';
import { MAX_PROMPT_TEXT_ANSWER_LENGTH } from '../profile-prompts.constants';

export class RecordTextAnswerDto {
  @IsString()
  @IsNotEmpty()
  promptId!: string;

  @IsString()
  @Length(1, MAX_PROMPT_TEXT_ANSWER_LENGTH)
  answer!: string;
}
