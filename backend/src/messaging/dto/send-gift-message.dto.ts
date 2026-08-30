import { IsOptional, IsString, Length } from 'class-validator';

export class SendGiftMessageDto {
  @IsString()
  giftId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  message?: string;
}
