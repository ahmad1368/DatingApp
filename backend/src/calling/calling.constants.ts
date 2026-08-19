export const CALL_TYPES = ['AUDIO', 'VIDEO'] as const;

export type CallType = (typeof CALL_TYPES)[number];

export const CALL_STATUSES = ['RINGING', 'ACCEPTED', 'DECLINED', 'ENDED', 'MISSED'] as const;

export type CallStatus = (typeof CALL_STATUSES)[number];

export const ACTIVE_CALL_STATUSES: CallStatus[] = ['RINGING', 'ACCEPTED'];
