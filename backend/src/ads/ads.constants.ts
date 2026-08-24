export interface AdCreative {
  id: string;
  type: 'NATIVE' | 'DISPLAY' | 'SPONSORED_PROFILE';
  headline: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
}

/**
 * Static ad inventory - no real ad-network SDK (AdMob, Meta Audience
 * Network, ...) is integrated in this codebase, so this stands in the same
 * way GiphyClient/OpenAiContentModerator stand in for their external
 * services elsewhere. Curated and static, like ICEBREAKER_PROMPTS.
 */
export const AD_CREATIVES: AdCreative[] = [
  {
    id: 'native-travel-app',
    type: 'NATIVE',
    headline: 'Plan your next date getaway',
    body: 'Find flights and stays for your next trip together.',
    imageUrl: 'https://example.com/ads/travel-app.jpg',
    ctaLabel: 'Explore',
    ctaUrl: 'https://example.com/ads/travel-app',
  },
  {
    id: 'display-flower-delivery',
    type: 'DISPLAY',
    headline: 'Send flowers today',
    body: 'Same-day delivery for your next date.',
    imageUrl: 'https://example.com/ads/flowers.jpg',
    ctaLabel: 'Shop now',
    ctaUrl: 'https://example.com/ads/flowers',
  },
  {
    id: 'sponsored-restaurant-app',
    type: 'SPONSORED_PROFILE',
    headline: 'Book the perfect date spot',
    body: 'Reserve a table at a top-rated restaurant nearby.',
    imageUrl: 'https://example.com/ads/restaurant-app.jpg',
    ctaLabel: 'Reserve',
    ctaUrl: 'https://example.com/ads/restaurant-app',
  },
];
