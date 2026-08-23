import { IsString, MaxLength } from 'class-validator';

export class SetMatchNoteDto {
  /** Blank content clears the note. */
  @IsString()
  @MaxLength(1000)
  content!: string;
}
