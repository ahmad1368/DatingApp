import { IsIn } from 'class-validator';
import { PAID_SUBSCRIPTION_TIERS, PaidSubscriptionTier } from '../subscriptions.constants';

export class PurchaseVoucherDto {
  @IsIn(PAID_SUBSCRIPTION_TIERS)
  tier!: PaidSubscriptionTier;
}
