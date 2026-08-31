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
  // Bulk boost packs: stockpiled credits, not activated on purchase - see
  // PowerUpsService.purchaseBoostPack/activateBoost - so a strategic user
  // can buy ahead at a discount and deploy each boost during peak hours or
  // a busy weekend instead of right away.
  { id: 'boost-pack-3', label: 'Boost Pack (3x 30 min)', coinCost: 250, quantity: 3 },
  { id: 'boost-pack-5', label: 'Boost Pack (5x 30 min)', coinCost: 375, quantity: 5 },
  // Standalone, single-use Super Boost - the same SUPER tier/view multiplier
  // DiscoveryService.activateSuperBoost grants Platinum subscribers for
  // free, but purchasable a la carte without a subscription. See
  // PowerUpsService.purchaseSuperBoost.
  { id: 'super-boost', label: 'Super Boost (30 min)', coinCost: 400 },
  { id: 'super-like', label: 'Extra Super Like', coinCost: 20, quantity: 1 },
  // Bulk packs: a standalone microtransaction that grants several bonus
  // super likes at once, at a discount over buying that many one at a time
  // (see purchaseSuperLike, which just adds `quantity` regardless of pack
  // size, and PowerUpsService.spec for the discounted pricing).
  { id: 'super-like-pack-5', label: 'Super Like Pack (5)', coinCost: 90, quantity: 5 },
  { id: 'super-like-pack-10', label: 'Super Like Pack (10)', coinCost: 160, quantity: 10 },
  { id: 'super-like-pack-25', label: 'Super Like Pack (25)', coinCost: 350, quantity: 25 },
  // A la carte "Priority Like": puts one regular like at the top of the
  // recipient's queue, the same placement a premium subscriber's regular
  // likes already get automatically - see
  // DiscoveryService.recordSwipe/getDeck. Bulk packs mirror the super-like
  // packs above.
  { id: 'priority-like', label: 'Priority Like', coinCost: 15, quantity: 1 },
  { id: 'priority-like-pack-5', label: 'Priority Like Pack (5)', coinCost: 65, quantity: 5 },
  { id: 'priority-like-pack-10', label: 'Priority Like Pack (10)', coinCost: 120, quantity: 10 },
  // Single-use pass to view the "who liked you" grid without a subscription
  // - see DiscoveryService.getLikedByGrid/PowerUpsService.
  // purchaseSeeWhoLikedYouUnlock. Bulk pack mirrors the other packs above.
  { id: 'see-who-liked-you-unlock', label: 'See Who Liked You (1 unlock)', coinCost: 50, quantity: 1 },
  { id: 'see-who-liked-you-unlock-pack-5', label: 'See Who Liked You Pack (5 unlocks)', coinCost: 200, quantity: 5 },
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
