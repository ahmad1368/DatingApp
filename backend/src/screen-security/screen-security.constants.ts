export const SCREEN_SECURITY_CONTEXTS = ['PROFILE', 'CHAT'] as const;
export type ScreenSecurityContext = (typeof SCREEN_SECURITY_CONTEXTS)[number];

/** Violations within the freeze window before the account is temporarily frozen. */
export const VIOLATION_FREEZE_THRESHOLD = 3;

/** How long an account stays frozen once it crosses the threshold. */
export const FREEZE_DURATION_HOURS = 24;
