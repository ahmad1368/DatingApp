import { IsInt, IsNotEmpty, IsString, Length, Max, Min } from 'class-validator';
import { MAX_PROMPT_VOICE_SECONDS } from '../profile-prompts.constants';

export class RecordVoiceAnswerDto {
  @IsString()
  @IsNotEmpty()
  promptId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  audioUrl!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PROMPT_VOICE_SECONDS)
  durationSeconds!: number;
}
