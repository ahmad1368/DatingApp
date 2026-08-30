export const DEVICE_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

// What the notification feed can currently be populated with. New match and
// new message are wired up (see MessagingService.notifyNewMessage and
// DiscoveryService.recordSwipe); like/profile-activity notifications can be
// raised by calling NotificationsService.notify with these same type ids.
export const NOTIFICATION_TYPES = [
  'NEW_MATCH',
  'NEW_MESSAGE',
  'NEW_LIKE',
  'PROFILE_ACTIVITY',
  'TOP_PICK',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const MAX_NOTIFICATIONS_RETURNED = 50;
