import { IsString, Length } from 'class-validator';

export class SendTrackMessageDto {
  @IsString()
  @Length(1, 200)
  trackId!: string;
}
