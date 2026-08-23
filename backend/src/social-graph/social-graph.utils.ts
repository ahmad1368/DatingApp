import { PrismaService } from '../prisma/prisma.service';

/**
 * Batched mutual-connection counts for a whole deck at once: how many of
 * `userId`'s synced contacts also appear in each candidate's synced
 * contacts. Callers merge this into the deck cards they build (see
 * DiscoveryService.getDeck/getLikedByGrid).
 */
export async function getMutualConnectionCounts(
  prisma: PrismaService,
  userId: string,
  candidateIds: string[],
): Promise<Map<string, number>> {
  if (candidateIds.length === 0) {
    return new Map();
  }

  const myContacts = await prisma.socialContact.findMany({
    where: { userId },
    select: { contactValue: true },
  });
  const myContactValues = myContacts.map((contact) => contact.contactValue);
  if (myContactValues.length === 0) {
    return new Map();
  }

  const overlapping = await prisma.socialContact.findMany({
    where: { userId: { in: candidateIds }, contactValue: { in: myContactValues } },
    select: { userId: true },
  });

  const counts = new Map<string, number>();
  for (const contact of overlapping) {
    counts.set(contact.userId, (counts.get(contact.userId) ?? 0) + 1);
  }
  return counts;
}
