export interface VirtualGift {
  id: string;
  name: string;
  emoji: string;
  tokenCost: number;
}

// Purely virtual/cosmetic tokens - there's no payment provider wired up
// anywhere in this codebase yet, so gifts are "spent" from a starting
// token balance rather than purchased with real money (see
// GiftingService/User.giftTokenBalance).
export const VIRTUAL_GIFTS: VirtualGift[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', tokenCost: 10 },
  { id: 'coffee', name: 'Coffee', emoji: '☕', tokenCost: 15 },
  { id: 'wine', name: 'Wine', emoji: '🍷', tokenCost: 25 },
  { id: 'teddy-bear', name: 'Teddy Bear', emoji: '🧸', tokenCost: 40 },
  { id: 'diamond', name: 'Diamond', emoji: '💎', tokenCost: 100 },
  { id: 'crown', name: 'Crown', emoji: '👑', tokenCost: 250 },
  { id: 'fireworks', name: 'Fireworks', emoji: '🎆', tokenCost: 500 },
];

export function findVirtualGift(giftId: string): VirtualGift | undefined {
  return VIRTUAL_GIFTS.find((gift) => gift.id === giftId);
}
