export const USER_REPORT_REASONS = [
  'HARASSMENT',
  'FAKE_PROFILE',
  'INAPPROPRIATE_CONTENT',
  'IN_PERSON_SAFETY_CONCERN',
  'SCAM_OR_SOLICITATION',
  'OTHER',
] as const;

export type UserReportReason = (typeof USER_REPORT_REASONS)[number];

// Grace window after a check-in's scheduled time before it's surfaced as
// overdue, to absorb the normal "running a few minutes late" case.
export const CHECK_IN_OVERDUE_GRACE_MINUTES = 30;

export function isCheckInOverdue(scheduledAt: Date, confirmedAt: Date | null, now: Date): boolean {
  if (confirmedAt != null) {
    return false;
  }
  return now.getTime() > scheduledAt.getTime() + CHECK_IN_OVERDUE_GRACE_MINUTES * 60 * 1000;
}

export interface SafetyResource {
  id: string;
  title: string;
  summary: string;
  category: string;
}

export const SAFETY_RESOURCES: SafetyResource[] = [
  {
    id: 'meet-in-public',
    title: 'Meet in a public place',
    summary:
      "For the first few dates, choose a busy public venue and arrange your own transportation there and back.",
    category: 'FIRST_DATE',
  },
  {
    id: 'tell-a-friend',
    title: 'Tell a friend your plans',
    summary:
      "Share who you're meeting, where, and when with someone you trust - our date check-in tool can do this for you.",
    category: 'FIRST_DATE',
  },
  {
    id: 'video-chat-first',
    title: 'Video chat before meeting',
    summary: 'A quick video call helps confirm the person behind the profile before you meet in person.',
    category: 'BEFORE_MEETING',
  },
  {
    id: 'trust-your-instincts',
    title: 'Trust your instincts',
    summary: "If something feels off, it's okay to leave, and it's okay to report the profile afterward.",
    category: 'DURING_DATE',
  },
  {
    id: 'report-dont-ignore',
    title: "Report, don't just block",
    summary:
      'Blocking removes someone from your view, but reporting helps us take action and protect other users too.',
    category: 'SAFETY_TOOLS',
  },
  {
    id: 'emergency-services',
    title: 'In an emergency, call local emergency services first',
    summary:
      'This app is not a substitute for emergency services. If you are ever in immediate danger, contact local emergency services before anything else.',
    category: 'EMERGENCY',
  },
];
