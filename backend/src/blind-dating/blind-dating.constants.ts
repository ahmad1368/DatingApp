// A blind date session lasts this long before it's treated as ended
// (computed at read time, same TTL-without-a-cron pattern used for boosts
// and snooze elsewhere in this app).
export const SESSION_DURATION_MINUTES = 10;

export function computeSessionExpiresAt(from: Date): Date {
  return new Date(from.getTime() + SESSION_DURATION_MINUTES * 60 * 1000);
}
