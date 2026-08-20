import { IsInt, IsNotEmpty, IsString, Length, Max, Min } from 'class-validator';
import { MAX_VOICE_NOTE_SECONDS } from '../messaging.constants';

export class SendVoiceNoteDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  mediaUrl!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_VOICE_NOTE_SECONDS)
  durationSeconds!: number;
}
