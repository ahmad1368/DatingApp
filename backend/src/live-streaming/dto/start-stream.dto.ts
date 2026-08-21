import { IsString, Length } from 'class-validator';

export class StartStreamDto {
  @IsString()
  @Length(1, 100)
  title!: string;
}
