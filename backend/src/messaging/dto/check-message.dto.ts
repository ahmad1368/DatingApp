import { IsString, Length } from 'class-validator';

export class CheckMessageDto {
  @IsString()
  @Length(1, 2000)
  text!: string;
}
