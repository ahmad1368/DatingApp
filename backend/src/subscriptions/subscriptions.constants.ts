export const PAID_SUBSCRIPTION_TIERS = ['PLUS', 'GOLD', 'PLATINUM'] as const;
export type PaidSubscriptionTier = (typeof PAID_SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_TIERS = ['FREE', ...PAID_SUBSCRIPTION_TIERS] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_PERIOD_DAYS = 30;

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  label: string;
  priceUsdPerMonth: number;
  features: string[];
}

// Cross-platform entitlements are tracked here, but there's no App Store /
// Play Store / Stripe billing integration anywhere in this codebase, so
// [SubscriptionsService.subscribe] activates the tier directly rather than
// validating a store receipt. Pricing is informational, not wired to a real
// payment processor.
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'FREE',
    label: 'Free',
    priceUsdPerMonth: 0,
    features: ['Standard swiping', 'Basic matching'],
  },
  {
    tier: 'PLUS',
    label: 'Plus',
    priceUsdPerMonth: 9.99,
    features: ['Unlimited likes', 'Rewind your last swipe', 'Hide ads'],
  },
  {
    tier: 'GOLD',
    label: 'Gold',
    priceUsdPerMonth: 19.99,
    features: ['Everything in Plus', 'See who liked you', 'One Boost a month'],
  },
  {
    tier: 'PLATINUM',
    label: 'Platinum',
    priceUsdPerMonth: 29.99,
    features: [
      'Everything in Gold',
      'Priority likes',
      'Unlimited rewinds',
      'Reconnect with expired matches',
    ],
  },
];

const PLAN_PRICE_BY_TIER = new Map(SUBSCRIPTION_PLANS.map((plan) => [plan.tier, plan.priceUsdPerMonth]));

/**
 * Mid-cycle upgrade (e.g. Gold to Platinum) pro-ration: instead of a real
 * dollar credit/refund (there's no payment processor here - see the module
 * doc above), the unused time on the current tier is converted into bonus
 * time on the new tier, scaled by the price difference, and added on top of
 * a fresh SUBSCRIPTION_PERIOD_DAYS period. A downgrade, a same-tier renewal,
 * or subscribing from FREE/a lapsed tier just gets a plain fresh period.
 */
export function computeSubscribeExpiresAt(
  now: Date,
  currentTier: SubscriptionTier,
  currentExpiresAt: Date | null,
  newTier: PaidSubscriptionTier,
): Date {
  const baseMs = SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000;

  const isUpgrade =
    currentTier !== 'FREE' &&
    currentExpiresAt != null &&
    currentExpiresAt.getTime() > now.getTime() &&
    PAID_SUBSCRIPTION_TIERS.indexOf(newTier) >
      PAID_SUBSCRIPTION_TIERS.indexOf(currentTier as PaidSubscriptionTier);

  if (!isUpgrade) {
    return new Date(now.getTime() + baseMs);
  }

  const remainingMs = currentExpiresAt!.getTime() - now.getTime();
  const currentPrice = PLAN_PRICE_BY_TIER.get(currentTier) ?? 0;
  const newPrice = PLAN_PRICE_BY_TIER.get(newTier) ?? 0;
  const creditMs = newPrice > 0 ? remainingMs * (currentPrice / newPrice) : 0;

  return new Date(now.getTime() + baseMs + creditMs);
}
