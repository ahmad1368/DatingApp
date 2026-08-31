export const FIRST_MESSAGE_WINDOW_HOURS = 24;

// A match can be extended once (see MessagingService.extendMatchTimeLimit)
// to give the pair more time before it dissolves for never messaging.
export const MATCH_EXTENSION_HOURS = 24;

export const WOMAN_GENDER_IDENTITIES = ['Woman', 'Transgender Woman'];

// A la carte cost (from User.giftTokenBalance, the same currency spent on
// virtual gifts/boosts elsewhere) to reveal that one specific sent message
// was actually read - see MessagingService.unlockReadReceipt. Any paid
// subscription tier gets every read receipt for free instead of paying per
// message, same "subscription beats a one-off spend" shape as
// PowerUpsService's boost packs.
export const READ_RECEIPT_UNLOCK_TOKEN_COST = 10;

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

// "First move" reminder: once a match's 24-hour firstMessageExpiresAt
// deadline is this close, whichever side is allowed to send the first
// message gets a one-time push reminder - see
// MessagingService.sendFirstMoveRemindersIfNeeded.
export const FIRST_MOVE_REMINDER_WINDOW_HOURS = 4;

export function needsFirstMoveReminder(
  match: { firstMessageSentAt: Date | null; firstMessageExpiresAt: Date; firstMoveReminderSentAt: Date | null },
  now: Date,
): boolean {
  if (match.firstMessageSentAt != null || match.firstMoveReminderSentAt != null) {
    return false;
  }
  const hoursRemaining = (match.firstMessageExpiresAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  return hoursRemaining > 0 && hoursRemaining <= FIRST_MOVE_REMINDER_WINDOW_HOURS;
}

export const MEDIA_CONTENT_TYPES = ['IMAGE', 'GIF', 'VIDEO_REACTION'] as const;

// A quick, looping video reaction clip - kept short so it stays a fast
// emotional beat rather than a full video message.
export const MAX_VIDEO_REACTION_SECONDS = 5;

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

export const RESERVATION_CONTENT_TYPE = 'RESERVATION';
export const RESERVATION_PROVIDERS = ['OPENTABLE', 'EVENTBRITE'] as const;
export type ReservationProvider = (typeof RESERVATION_PROVIDERS)[number];

// A virtual gift sent directly into the chat as its own message (see
// MessagingService.sendGiftMessage), as opposed to GiftingService.sendGift's
// direct profile-to-profile send - the gift id lives in `content`, mirroring
// how a RESERVATION message stores its query there.
export const GIFT_CONTENT_TYPE = 'GIFT';

// A dropped map pin for a public venue/coffee shop, to coordinate a date
// meetup - see MessagingService.sendLocationPin. The venue name lives in
// `content`, mirroring how a RESERVATION message stores its query there.
export const LOCATION_PIN_CONTENT_TYPE = 'LOCATION_PIN';

const RESERVATION_SEARCH_URLS: Record<ReservationProvider, string> = {
  OPENTABLE: 'https://www.opentable.com/s',
  EVENTBRITE: 'https://www.eventbrite.com/d/search',
};

const RESERVATION_SEARCH_PARAMS: Record<ReservationProvider, string> = {
  OPENTABLE: 'term',
  EVENTBRITE: 'q',
};

/**
 * Deep-links to a third-party reservation/ticketing platform's own search
 * results for whatever the sender typed (a restaurant name for OpenTable, an
 * event name for Eventbrite) - no OpenTable/Eventbrite API keys or OAuth
 * flow exist in this codebase, so completing the actual booking happens on
 * their site once the recipient taps through, the same "generate a search
 * URL, don't broker the transaction" approach as
 * DateSuggestionsService.buildMapsSearchUrl.
 */
export function buildReservationUrl(provider: ReservationProvider, query: string): string {
  const base = RESERVATION_SEARCH_URLS[provider];
  const param = RESERVATION_SEARCH_PARAMS[provider];
  return `${base}?${param}=${encodeURIComponent(query)}`;
}

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

export const CHAT_WALLPAPER_TYPES = ['GRADIENT', 'PATTERN', 'PHOTO'] as const;
export type ChatWallpaperType = (typeof CHAT_WALLPAPER_TYPES)[number];

export interface ChatWallpaper {
  id: string;
  label: string;
  type: ChatWallpaperType;
}

// Curated per-thread chat backgrounds - applied client-side, same as
// VOICE_EFFECTS/BACKGROUND_SOUNDS. See ChatWallpaperPreference for how a
// choice is stored per (user, match) pair.
export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  { id: 'sunset-gradient', label: 'Sunset Gradient', type: 'GRADIENT' },
  { id: 'ocean-gradient', label: 'Ocean Gradient', type: 'GRADIENT' },
  { id: 'midnight-gradient', label: 'Midnight Gradient', type: 'GRADIENT' },
  { id: 'polka-dot', label: 'Polka Dot', type: 'PATTERN' },
  { id: 'geometric', label: 'Geometric', type: 'PATTERN' },
  { id: 'confetti', label: 'Confetti', type: 'PATTERN' },
  { id: 'city-skyline', label: 'City Skyline', type: 'PHOTO' },
  { id: 'botanical', label: 'Botanical', type: 'PHOTO' },
];

export function findChatWallpaper(id: string): ChatWallpaper | undefined {
  return CHAT_WALLPAPERS.find((wallpaper) => wallpaper.id === id);
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

export const GAME_CARD_CONTENT_TYPE = 'GAME_CARD';

export const GAME_TYPES = ['TRIVIA', 'TWENTY_ONE_QUESTIONS', 'TWO_TRUTHS_AND_A_LIE'] as const;
export type GameType = (typeof GAME_TYPES)[number];

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
}

// Curated multiple-choice trivia cards for the in-chat "Game Night" feature -
// no admin tooling exists to manage this content yet, so it lives in code
// like ICEBREAKER_PROMPTS.
export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: 'planet-largest',
    question: 'Which is the largest planet in our solar system?',
    options: ['Earth', 'Jupiter', 'Saturn', 'Mars'],
    correctOptionIndex: 1,
  },
  {
    id: 'eiffel-tower-city',
    question: 'Which city is the Eiffel Tower in?',
    options: ['Rome', 'London', 'Paris', 'Berlin'],
    correctOptionIndex: 2,
  },
  {
    id: 'ocean-largest',
    question: 'What is the largest ocean on Earth?',
    options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
    correctOptionIndex: 3,
  },
  {
    id: 'mona-lisa-artist',
    question: 'Who painted the Mona Lisa?',
    options: ['Van Gogh', 'Da Vinci', 'Picasso', 'Monet'],
    correctOptionIndex: 1,
  },
  {
    id: 'human-bones',
    question: 'How many bones are in the adult human body?',
    options: ['186', '206', '226', '246'],
    correctOptionIndex: 1,
  },
  {
    id: 'smallest-country',
    question: 'What is the smallest country in the world?',
    options: ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'],
    correctOptionIndex: 2,
  },
  {
    id: 'fastest-land-animal',
    question: 'What is the fastest land animal?',
    options: ['Lion', 'Cheetah', 'Gazelle', 'Horse'],
    correctOptionIndex: 1,
  },
  {
    id: 'water-boiling-point',
    question: 'At sea level, at what temperature (Celsius) does water boil?',
    options: ['90', '100', '110', '120'],
    correctOptionIndex: 1,
  },
];

export function findTriviaQuestion(id: string): TriviaQuestion | undefined {
  return TRIVIA_QUESTIONS.find((question) => question.id === id);
}

export interface TwentyOneQuestionsPrompt {
  id: string;
  question: string;
}

// Curated conversation-deepening questions for a lightweight in-chat "21
// Questions" game - each card is just a question to send; the reply is a
// normal chat message, mirroring how a RESERVATION card hands off to a
// third party rather than modeling the whole interaction server-side.
export const TWENTY_ONE_QUESTIONS_PROMPTS: TwentyOneQuestionsPrompt[] = [
  { id: 'q-perfect-first-date', question: 'What is your idea of a perfect first date?' },
  { id: 'q-skill-wish', question: "What's a skill you wish you had?" },
  { id: 'q-love-language', question: 'What is your love language?' },
  { id: 'q-best-trip', question: "What's the best trip you've ever taken?" },
  { id: 'q-introvert-extrovert', question: 'Are you more of an introvert or an extrovert?' },
  { id: 'q-biggest-goal', question: 'What is your biggest goal for this year?' },
  { id: 'q-comfort-food', question: "What's your go-to comfort food?" },
  { id: 'q-rewatch-movie', question: 'What movie can you watch over and over?' },
  { id: 'q-controversial-opinion', question: 'What is your most controversial (harmless) opinion?' },
  { id: 'q-new-hobby', question: "What's a hobby you'd love to pick up?" },
];

export function findTwentyOneQuestionsPrompt(id: string): TwentyOneQuestionsPrompt | undefined {
  return TWENTY_ONE_QUESTIONS_PROMPTS.find((prompt) => prompt.id === id);
}

// "Two Truths and a Lie" is player-authored rather than curated: the sender
// writes exactly this many statements and flags which one is the lie.
export const TWO_TRUTHS_STATEMENT_COUNT = 3;

export function computeFirstMessageExpiresAt(from: Date): Date {
  return new Date(from.getTime() + FIRST_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000);
}

export function computeExtendedExpiresAt(from: Date): Date {
  return new Date(from.getTime() + MATCH_EXTENSION_HOURS * 60 * 60 * 1000);
}

export function isWoman(genderIdentities: string[]): boolean {
  return genderIdentities.some((identity) => WOMAN_GENDER_IDENTITIES.includes(identity));
}
