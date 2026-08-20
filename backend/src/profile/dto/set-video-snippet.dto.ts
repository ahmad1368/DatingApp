import { IsNotEmpty, IsString, Length } from 'class-validator';

export class SetVideoSnippetDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  url!: string;
}
