export interface VirtualGift {
  id: string;
  name: string;
  emoji: string;
  tokenCost: number;
  // Pricier gifts get a client-side animated flourish (e.g. a burst/shimmer
  // effect) instead of just appearing statically - there's no actual
  // animation asset pipeline in this codebase, so this is just the flag the
  // client keys its animation choice off of.
  animated: boolean;
}

// Purely virtual/cosmetic tokens - there's no payment provider wired up
// anywhere in this codebase yet, so gifts are "spent" from a starting
// token balance rather than purchased with real money (see
// GiftingService/User.giftTokenBalance).
export const VIRTUAL_GIFTS: VirtualGift[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', tokenCost: 10, animated: false },
  { id: 'coffee', name: 'Coffee', emoji: '☕', tokenCost: 15, animated: false },
  { id: 'balloon', name: 'Balloon', emoji: '🎈', tokenCost: 15, animated: false },
  { id: 'wine', name: 'Wine', emoji: '🍷', tokenCost: 25, animated: false },
  { id: 'chocolate', name: 'Chocolate Box', emoji: '🍫', tokenCost: 30, animated: false },
  { id: 'teddy-bear', name: 'Teddy Bear', emoji: '🧸', tokenCost: 40, animated: false },
  { id: 'bouquet', name: 'Bouquet', emoji: '💐', tokenCost: 50, animated: true },
  { id: 'cocktail', name: 'Cocktail', emoji: '🍸', tokenCost: 60, animated: true },
  { id: 'shooting-star', name: 'Shooting Star', emoji: '🌠', tokenCost: 75, animated: true },
  { id: 'diamond', name: 'Diamond', emoji: '💎', tokenCost: 100, animated: true },
  { id: 'sports-car', name: 'Sports Car', emoji: '🏎️', tokenCost: 150, animated: true },
  { id: 'crown', name: 'Crown', emoji: '👑', tokenCost: 250, animated: true },
  { id: 'yacht', name: 'Yacht', emoji: '🛥️', tokenCost: 400, animated: true },
  { id: 'fireworks', name: 'Fireworks', emoji: '🎆', tokenCost: 500, animated: true },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', tokenCost: 1000, animated: true },
];

export function findVirtualGift(giftId: string): VirtualGift | undefined {
  return VIRTUAL_GIFTS.find((gift) => gift.id === giftId);
}
