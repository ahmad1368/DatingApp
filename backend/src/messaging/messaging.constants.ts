export const FIRST_MESSAGE_WINDOW_HOURS = 24;

// A match can be extended once (see MessagingService.extendMatchTimeLimit)
// to give the pair more time before it dissolves for never messaging.
export const MATCH_EXTENSION_HOURS = 24;

export const WOMAN_GENDER_IDENTITIES = ['Woman', 'Transgender Woman'];

// A conversation that's gone this many days without a reply from whoever's
// turn it is to answer gets a "reply or unmatch" nudge on their match list.
export const GHOSTING_PROMPT_THRESHOLD_DAYS = 3;

// Incognito ghosting protection: once a match's conversation has gone this
// many days without any message, that match stops being able to see this
// user's activity status/last-active timestamp - see
// MessagingService.toMatchStatus.
export const GHOSTING_PROTECTION_INACTIVITY_DAYS = 7;

// A conversation that HAS exchanged messages but has gone completely quiet
// for this many days is auto-moved out of the main inbox (listMyMatches)
// into a separate "inactive" folder (listInactiveThreads) to declutter it -
// see MessagingService.buildMatchSummaries. Nothing is deleted: sending a
// new message naturally moves the thread back once its last-message age
// drops back under this threshold.
export const INACTIVITY_AUTO_ARCHIVE_DAYS = 14;

export function daysSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
}

export const MEDIA_CONTENT_TYPES = ['IMAGE', 'GIF'] as const;

// Auto-expiring media: VIEW_ONCE disappears immediately after the
// recipient's first view; TIMER disappears viewTimerSeconds after that
// first view. Neither starts counting down until actually opened - see
// MessagingService.viewEphemeralMedia.
export const EXPIRY_MODES = ['VIEW_ONCE', 'TIMER'] as const;
export type ExpiryMode = (typeof EXPIRY_MODES)[number];

export const MIN_VIEW_TIMER_SECONDS = 1;
export const MAX_VIEW_TIMER_SECONDS = 60;

export function isEphemeralExpired(
  message: { expiryMode: string | null; viewTimerSeconds: number | null; viewedAt: Date | null },
  now: Date,
): boolean {
  if (!message.expiryMode || !message.viewedAt) {
    return false;
  }
  if (message.expiryMode === 'VIEW_ONCE') {
    return true;
  }
  return now.getTime() > message.viewedAt.getTime() + (message.viewTimerSeconds ?? 0) * 1000;
}

export const DEFAULT_GIF_SEARCH_LIMIT = 20;
export const MAX_GIF_SEARCH_LIMIT = 50;

export const VOICE_NOTE_CONTENT_TYPE = 'VOICE_NOTE';
export const MAX_VOICE_NOTE_SECONDS = 60;

export const POLL_CONTENT_TYPE = 'POLL';
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;

export interface VoiceEffect {
  id: string;
  label: string;
}

// Playback-time voice modulation filters for in-chat voice notes. Applied
// client-side when the note plays back - no server-side audio processing
// exists in this codebase, so this just tags which filter the sender picked
// (curated and static, same as ICEBREAKER_PROMPTS).
export const VOICE_EFFECTS: VoiceEffect[] = [
  { id: 'chipmunk', label: 'Chipmunk' },
  { id: 'deep', label: 'Deep Voice' },
  { id: 'robot', label: 'Robot' },
  { id: 'echo', label: 'Echo' },
  { id: 'helium', label: 'Helium' },
];

export interface BackgroundSound {
  id: string;
  label: string;
}

// Ambient background tracks a sender can mix under a voice note, applied
// client-side the same way as VOICE_EFFECTS.
export const BACKGROUND_SOUNDS: BackgroundSound[] = [
  { id: 'rain', label: 'Rain' },
  { id: 'cafe', label: 'Cafe Ambience' },
  { id: 'campfire', label: 'Campfire' },
  { id: 'ocean-waves', label: 'Ocean Waves' },
  { id: 'vinyl-crackle', label: 'Vinyl Crackle' },
];

export function findVoiceEffect(id: string): VoiceEffect | undefined {
  return VOICE_EFFECTS.find((effect) => effect.id === id);
}

export function findBackgroundSound(id: string): BackgroundSound | undefined {
  return BACKGROUND_SOUNDS.find((sound) => sound.id === id);
}

export interface IcebreakerPrompt {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
}

// A two-option question card either person can send in-chat to spark
// conversation before meeting. Curated and static - no admin tooling exists
// to manage this content yet, so it lives in code like SAFETY_RESOURCES.
export const ICEBREAKER_PROMPTS: IcebreakerPrompt[] = [
  { id: 'morning-or-night', question: 'Morning person or night owl?', optionA: 'Morning person', optionB: 'Night owl' },
  { id: 'beach-or-mountains', question: 'Dream vacation?', optionA: 'Beach', optionB: 'Mountains' },
  { id: 'coffee-or-tea', question: 'Coffee or tea?', optionA: 'Coffee', optionB: 'Tea' },
  { id: 'dogs-or-cats', question: 'Dog person or cat person?', optionA: 'Dogs', optionB: 'Cats' },
  { id: 'homebody-or-adventurer', question: 'Ideal Friday night?', optionA: 'Cozy night in', optionB: 'Out on an adventure' },
  { id: 'planner-or-spontaneous', question: 'Planner or spontaneous?', optionA: 'Plan everything out', optionB: 'Go with the flow' },
  { id: 'sweet-or-savory', question: 'Sweet or savory?', optionA: 'Sweet', optionB: 'Savory' },
  { id: 'texter-or-caller', question: 'Texter or caller?', optionA: 'Texting', optionB: 'Phone calls' },
];

export function findIcebreakerPrompt(promptId: string): IcebreakerPrompt | undefined {
  return ICEBREAKER_PROMPTS.find((prompt) => prompt.id === promptId);
}

export function computeFirstMessageExpiresAt(from: Date): Date {
  return new Date(from.getTime() + FIRST_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000);
}

export function computeExtendedExpiresAt(from: Date): Date {
  return new Date(from.getTime() + MATCH_EXTENSION_HOURS * 60 * 60 * 1000);
}

export function isWoman(genderIdentities: string[]): boolean {
  return genderIdentities.some((identity) => WOMAN_GENDER_IDENTITIES.includes(identity));
}
