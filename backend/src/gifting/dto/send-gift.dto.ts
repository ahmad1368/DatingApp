import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class SendGiftDto {
  @IsUUID()
  recipientId!: string;

  @IsString()
  giftId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  message?: string;
}
