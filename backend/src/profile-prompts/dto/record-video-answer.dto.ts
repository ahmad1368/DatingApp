import { IsInt, IsNotEmpty, IsString, Length, Max, Min } from 'class-validator';
import { MAX_PROMPT_VIDEO_SECONDS } from '../profile-prompts.constants';

export class RecordVideoAnswerDto {
  @IsString()
  @IsNotEmpty()
  promptId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  videoUrl!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PROMPT_VIDEO_SECONDS)
  durationSeconds!: number;
}
