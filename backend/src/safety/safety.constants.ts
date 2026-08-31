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

export interface EmergencyHotline {
  id: string;
  name: string;
  phoneNumber: string;
  description: string;
}

/** Static, curated directory - not tied to the user's location, unlike EmergencyContact. */
export const EMERGENCY_HOTLINES: EmergencyHotline[] = [
  {
    id: 'us-emergency',
    name: 'Emergency Services (US)',
    phoneNumber: '911',
    description: 'For any immediate, life-threatening emergency.',
  },
  {
    id: 'domestic-violence',
    name: 'National Domestic Violence Hotline',
    phoneNumber: '1-800-799-7233',
    description: 'Confidential support, 24/7, for anyone experiencing domestic violence.',
  },
  {
    id: 'sexual-assault',
    name: 'National Sexual Assault Hotline',
    phoneNumber: '1-800-656-4673',
    description: 'Confidential support from a trained staff member, 24/7.',
  },
  {
    id: 'suicide-crisis',
    name: 'Suicide & Crisis Lifeline',
    phoneNumber: '988',
    description: 'Free, confidential support for people in distress, 24/7.',
  },
  {
    id: 'poison-control',
    name: 'Poison Control',
    phoneNumber: '1-800-222-1222',
    description: 'Immediate guidance for a suspected poisoning or drink-tampering incident.',
  },
];

export interface ScamQuizQuestion {
  id: string;
  scenario: string;
  isScam: boolean;
  explanation: string;
}

/**
 * A self-assessment "spot the romance scam" quiz: [SafetyService.
 * getScamQuizQuestions] withholds isScam/explanation so the answer can't be
 * read off the question list, and [SafetyService.submitScamQuiz] grades a
 * submitted guess against them.
 */
export const SCAM_AWARENESS_QUIZ: ScamQuizQuestion[] = [
  {
    id: 'ask-for-gift-cards',
    scenario:
      'A match you have never met in person asks you to buy gift cards to help them out of a sudden emergency.',
    isScam: true,
    explanation:
      'Gift card requests are one of the most common romance-scam red flags - legitimate emergencies are never resolved with gift card codes.',
  },
  {
    id: 'refuses-video-call',
    scenario: 'A match makes excuse after excuse to avoid ever getting on a video call, despite weeks of texting.',
    isScam: true,
    explanation:
      'Scammers frequently avoid video calls because it would reveal their real identity or that their photos are stolen.',
  },
  {
    id: 'suggests-public-cafe-date',
    scenario: 'A match suggests meeting for coffee at a busy cafe near your neighborhood for a first date.',
    isScam: false,
    explanation: 'A public, well-lit venue for a first date is a normal, safety-conscious suggestion, not a red flag.',
  },
  {
    id: 'urgent-crypto-investment',
    scenario:
      'A match who claims to be a successful trader urges you to invest in a crypto platform they personally recommend.',
    isScam: true,
    explanation:
      'Pushing a partner toward a specific investment platform is a hallmark of "pig butchering" romance-investment scams.',
  },
  {
    id: 'shares-verified-social-profile',
    scenario: 'A match shares a long-standing social media profile with years of tagged photos with friends and family.',
    isScam: false,
    explanation: 'An established, verifiable online presence with a real social history is a positive signal, not a red flag.',
  },
];

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
