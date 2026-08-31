import { IsBoolean } from 'class-validator';

export class RespondVoicePreviewRequestDto {
  @IsBoolean()
  accept!: boolean;
}
