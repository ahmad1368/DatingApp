import { IsIn, IsString } from 'class-validator';
import { PAID_SUBSCRIPTION_TIERS, PaidSubscriptionTier } from '../subscriptions.constants';

export class GiftSubscriptionDto {
  @IsString()
  recipientId!: string;

  @IsIn(PAID_SUBSCRIPTION_TIERS)
  tier!: PaidSubscriptionTier;
}
