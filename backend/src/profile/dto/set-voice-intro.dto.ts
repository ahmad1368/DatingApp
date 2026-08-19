import { IsInt, IsNotEmpty, IsString, Length, Max, Min } from 'class-validator';
import { MAX_VOICE_INTRO_SECONDS } from '../profile.constants';

export class SetVoiceIntroDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  url!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_VOICE_INTRO_SECONDS)
  durationSeconds!: number;
}
