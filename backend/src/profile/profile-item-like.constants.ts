export const PROFILE_ITEM_TYPES = ['PHOTO', 'VOICE_MEMO'] as const;

export type ProfileItemType = (typeof PROFILE_ITEM_TYPES)[number];

export const MAX_ITEM_COMMENT_LENGTH = 300;
