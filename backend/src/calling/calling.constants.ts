export const CALL_TYPES = ['AUDIO', 'VIDEO'] as const;

export type CallType = (typeof CALL_TYPES)[number];

export const CALL_STATUSES = ['RINGING', 'ACCEPTED', 'DECLINED', 'ENDED', 'MISSED'] as const;

export type CallStatus = (typeof CALL_STATUSES)[number];

export const ACTIVE_CALL_STATUSES: CallStatus[] = ['RINGING', 'ACCEPTED'];

export interface VirtualBackground {
  id: string;
  label: string;
}

// "Video Date Mode" virtual backgrounds - curated and static, like
// ICEBREAKER_PROMPTS, since there's no admin tooling to manage this content.
// Actually compositing the background onto the video feed is a client-side
// concern; the backend only tracks which one a caller has selected.
export const VIRTUAL_BACKGROUNDS: VirtualBackground[] = [
  { id: 'none', label: 'None' },
  { id: 'coffee-shop', label: 'Coffee Shop' },
  { id: 'beach-sunset', label: 'Beach Sunset' },
  { id: 'cozy-library', label: 'Cozy Library' },
  { id: 'city-skyline', label: 'City Skyline' },
];

export function findVirtualBackground(backgroundId: string): VirtualBackground | undefined {
  return VIRTUAL_BACKGROUNDS.find((background) => background.id === backgroundId);
}

export interface AppearanceFilter {
  id: string;
  label: string;
}

// "Video Date Mode" subtle appearance filters - a cosmetic overlay separate
// from VIRTUAL_BACKGROUNDS's backdrop swap. Curated and static, like
// VIRTUAL_BACKGROUNDS; actually applying the filter to the video feed is a
// client-side concern, the backend only tracks which one is selected.
export const APPEARANCE_FILTERS: AppearanceFilter[] = [
  { id: 'none', label: 'None' },
  { id: 'natural-glow', label: 'Natural Glow' },
  { id: 'soft-focus', label: 'Soft Focus' },
  { id: 'warm-tone', label: 'Warm Tone' },
  { id: 'brighten', label: 'Brighten' },
];

export function findAppearanceFilter(filterId: string): AppearanceFilter | undefined {
  return APPEARANCE_FILTERS.find((filter) => filter.id === filterId);
}
