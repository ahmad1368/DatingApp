import { IsString, Length } from 'class-validator';

export class SetPreferredLanguageDto {
  @IsString()
  @Length(1, 50)
  language!: string;
}
