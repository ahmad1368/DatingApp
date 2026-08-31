export const MAX_VAULT_PHOTOS = 20;
export const MAX_VAULT_ALBUMS = 10;

export const MIN_GRANT_EXPIRY_HOURS = 1;
export const MAX_GRANT_EXPIRY_HOURS = 24 * 30;

export function computeGrantExpiresAt(from: Date, expiresInHours: number): Date {
  return new Date(from.getTime() + expiresInHours * 60 * 60 * 1000);
}

export function isGrantExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt != null && now.getTime() > expiresAt.getTime();
}
