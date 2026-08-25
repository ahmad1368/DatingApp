export const CREDENTIAL_TYPES = ['WORK', 'EDUCATION'] as const;

export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_CODE_LENGTH = 6;
export const CREDENTIAL_CODE_TTL_SECONDS = 600;
export const CREDENTIAL_RESEND_COOLDOWN_SECONDS = 60;
export const CREDENTIAL_MAX_VERIFY_ATTEMPTS = 5;
