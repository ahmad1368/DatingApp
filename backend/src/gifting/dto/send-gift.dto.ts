import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class SendGiftDto {
  @IsUUID()
  recipientId!: string;

  @IsString()
  giftId!: string;

  /** Required when giftId is 'rose' - see GiftingService.sendGift. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  message?: string;
}
