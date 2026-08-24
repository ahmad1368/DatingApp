export interface PowerUp {
  id: string;
  label: string;
  coinCost: number;
}

// One-time, coin-purchased perks that don't require a subscription - spent
// from the same shared coin balance as gifting/live-streaming tips and
// wallet top-ups (see WalletService).
export const POWER_UPS: PowerUp[] = [
  { id: 'boost', label: 'Profile Boost (30 min)', coinCost: 100 },
  { id: 'super-like', label: 'Extra Super Like', coinCost: 20 },
  { id: 'extra-profile-views', label: 'Extra Profile Views (+20)', coinCost: 30 },
  { id: 'extend-match-timer', label: 'Extend Match Timer', coinCost: 40 },
];

/** How many bonus candidates the "Extra Profile Views" power-up adds to the next deck fetch. */
export const EXTRA_DECK_SLOTS_GRANTED = 20;

export function findPowerUp(powerUpId: string): PowerUp | undefined {
  return POWER_UPS.find((powerUp) => powerUp.id === powerUpId);
}
