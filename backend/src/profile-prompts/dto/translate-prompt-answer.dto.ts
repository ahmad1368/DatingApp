import { IsOptional, IsString, Length } from 'class-validator';

export class TranslatePromptAnswerDto {
  /** Defaults to the caller's preferredLanguage if omitted. */
  @IsOptional()
  @IsString()
  @Length(1, 50)
  targetLanguage?: string;
}
