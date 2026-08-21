export const EVENT_CATEGORIES = [
  'MIXER',
  'MEETUP',
  'ACTIVITY',
  'SPEED_DATING',
  'OUTDOOR',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
