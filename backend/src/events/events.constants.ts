export const EVENT_CATEGORIES = [
  'MIXER',
  'MEETUP',
  'ACTIVITY',
  'SPEED_DATING',
  'OUTDOOR',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Roughly the radius of a metropolitan area - events farther than this from the viewer are dropped from the feed. */
export const LOCAL_EVENTS_RADIUS_KM = 75;
