import { PrismaService } from '../prisma/prisma.service';

/**
 * Mutual invisibility: every user id the given user has blocked via a
 * synced contact, plus every user who has blocked *them* the same way.
 * Callers merge this into whatever candidate-exclusion set they already
 * build (see DiscoveryService.getDeck, CuratedProfilesService).
 */
export async function getBlockedUserIds(prisma: PrismaService, userId: string): Promise<string[]> {
  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.blockedContact.findMany({
      where: { userId, blockedUserId: { not: null } },
      select: { blockedUserId: true },
    }),
    prisma.blockedContact.findMany({
      where: { blockedUserId: userId },
      select: { userId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const record of blockedByMe) {
    if (record.blockedUserId) {
      ids.add(record.blockedUserId);
    }
  }
  for (const record of blockedMe) {
    ids.add(record.userId);
  }
  return [...ids];
}
