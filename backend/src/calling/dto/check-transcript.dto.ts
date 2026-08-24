import { IsString, Length } from 'class-validator';

export class CheckTranscriptDto {
  @IsString()
  @Length(1, 1000)
  transcriptSnippet!: string;
}
