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
