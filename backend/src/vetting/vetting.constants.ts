export const APPLICATION_DECISIONS = ['APPROVED', 'REJECTED'] as const;

export type ApplicationDecision = (typeof APPLICATION_DECISIONS)[number];

export const REQUIRED_PEER_REFERRALS = 2;

export const MAX_DECISION_REASON_LENGTH = 300;

export const MAX_SOCIAL_LINKS = 5;

/** Length of a generated referral code (see VettingService.generateReferralCode) - hex, so always even. */
export const REFERRAL_CODE_LENGTH = 8;
