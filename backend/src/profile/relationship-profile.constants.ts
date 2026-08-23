export const RELATIONSHIP_STRUCTURES = [
  'Monogamous',
  'Open',
  'Polyamorous',
  'Ethically Non-Monogamous',
  'Solo Polyamorous',
  'Relationship Anarchy',
  'Swinger',
  'Questioning',
] as const;

export const KINK_TAGS = [
  'BDSM',
  'Bondage',
  'Roleplay',
  'Dominant',
  'Submissive',
  'Switch',
  'Voyeurism',
  'Exhibitionism',
  'Sensory Play',
  'Impact Play',
  'Polyamory-Friendly',
  'Vanilla-Curious',
] as const;

export const RELATIONSHIP_DESIRES = [
  'Casual Dating',
  'Long-Term Relationship',
  'Friendship',
  'Non-Monogamous Dating',
  'Thruple',
  'Marriage',
  'Not Sure Yet',
] as const;

export const MAX_KINK_TAG_SELECTIONS = 8;
export const MAX_RELATIONSHIP_DESIRE_SELECTIONS = 5;
export const MAX_CUSTOM_RELATIONSHIP_INTENT_LENGTH = 60;

/**
 * Freeform note on how someone likes to communicate and what's off-limits
 * (e.g. "Texting only until we meet", "No calls before 9am") - distinct from
 * customRelationshipIntent, which is about relationship goals, not
 * communication style.
 */
export const MAX_COMMUNICATION_BOUNDARIES_LENGTH = 300;
