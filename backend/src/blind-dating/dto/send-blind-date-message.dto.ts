import { IsString, Length } from 'class-validator';

export class SendBlindDateMessageDto {
  @IsString()
  @Length(1, 1000)
  content!: string;
}
