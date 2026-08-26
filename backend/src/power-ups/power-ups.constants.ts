export interface PowerUp {
  id: string;
  label: string;
  coinCost: number;
  /** How many bonus super likes this grants - only set for the single super
   * like and its bulk packs below; every other power-up is a one-off. */
  quantity?: number;
}

// One-time, coin-purchased perks that don't require a subscription - spent
// from the same shared coin balance as gifting/live-streaming tips and
// wallet top-ups (see WalletService).
export const POWER_UPS: PowerUp[] = [
  { id: 'boost', label: 'Profile Boost (30 min)', coinCost: 100 },
  { id: 'super-like', label: 'Extra Super Like', coinCost: 20, quantity: 1 },
  // Bulk packs: a standalone microtransaction that grants several bonus
  // super likes at once, at a discount over buying that many one at a time
  // (see purchaseSuperLike, which just adds `quantity` regardless of pack
  // size, and PowerUpsService.spec for the discounted pricing).
  { id: 'super-like-pack-5', label: 'Super Like Pack (5)', coinCost: 90, quantity: 5 },
  { id: 'super-like-pack-10', label: 'Super Like Pack (10)', coinCost: 160, quantity: 10 },
  { id: 'super-like-pack-25', label: 'Super Like Pack (25)', coinCost: 350, quantity: 25 },
  { id: 'extra-profile-views', label: 'Extra Profile Views (+20)', coinCost: 30 },
  { id: 'extend-match-timer', label: 'Extend Match Timer', coinCost: 40 },
  // Standalone, permanent toggle (not a subscription perk): once purchased,
  // an unmatch or expired-unmessaged dissolution archives that
  // conversation's messages instead of deleting them - see
  // MessagingService.dissolveMatch and User.unmatchProtectionEnabled.
  { id: 'unmatch-protection', label: 'Unmatch Protection', coinCost: 75 },
];

/** How many bonus candidates the "Extra Profile Views" power-up adds to the next deck fetch. */
export const EXTRA_DECK_SLOTS_GRANTED = 20;

export function findPowerUp(powerUpId: string): PowerUp | undefined {
  return POWER_UPS.find((powerUp) => powerUp.id === powerUpId);
}
