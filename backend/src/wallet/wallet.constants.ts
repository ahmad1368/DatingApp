export interface CoinPackage {
  id: string;
  coinAmount: number;
  priceUsdCents: number;
  label: string;
}

// There's no payment provider wired up anywhere in this codebase (see
// gifting.constants.ts) - purchasing a package directly credits the coin
// balance, standing in for what a payment webhook would otherwise trigger.
export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'starter', coinAmount: 100, priceUsdCents: 199, label: '100 coins' },
  { id: 'popular', coinAmount: 550, priceUsdCents: 999, label: '550 coins' },
  { id: 'value', coinAmount: 1200, priceUsdCents: 1999, label: '1,200 coins' },
  { id: 'best', coinAmount: 3500, priceUsdCents: 4999, label: '3,500 coins' },
];

export function findCoinPackage(packageId: string): CoinPackage | undefined {
  return COIN_PACKAGES.find((coinPackage) => coinPackage.id === packageId);
}
