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
];

export function findPowerUp(powerUpId: string): PowerUp | undefined {
  return POWER_UPS.find((powerUp) => powerUp.id === powerUpId);
}
