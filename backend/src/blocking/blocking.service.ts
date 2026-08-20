import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SyncContactsResult {
  totalSubmitted: number;
  matchedUsers: number;
}

export interface BlockedContactView {
  id: string;
  contactValue: string;
  blockedUserId: string | null;
  blockedUserName: string | null;
  blockedUserPhotoUrl: string | null;
  createdAt: string;
}

@Injectable()
export class BlockingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Uploads/syncs a batch of phone numbers or emails from the user's
   * contacts. Any contact that matches an existing account's phone number
   * or email is blocked immediately (mutual invisibility, enforced in
   * DiscoveryService/CuratedProfilesService via getBlockedUserIds);
   * contacts that don't match anyone yet are still stored so a future
   * signup is blocked automatically.
   */
  async syncContacts(userId: string, contacts: string[]): Promise<SyncContactsResult> {
    const normalized = [...new Set(contacts.map((contact) => contact.trim().toLowerCase()).filter((contact) => contact.length > 0))];

    if (normalized.length === 0) {
      return { totalSubmitted: 0, matchedUsers: 0 };
    }

    const matchedUsers = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [{ phoneNumber: { in: normalized } }, { email: { in: normalized } }],
      },
      select: { id: true, phoneNumber: true, email: true },
    });

    const matchedUserIdByContact = new Map<string, string>();
    for (const user of matchedUsers) {
      if (user.phoneNumber) {
        matchedUserIdByContact.set(user.phoneNumber.toLowerCase(), user.id);
      }
      if (user.email) {
        matchedUserIdByContact.set(user.email.toLowerCase(), user.id);
      }
    }

    await Promise.all(
      normalized.map((contactValue) => {
        const blockedUserId = matchedUserIdByContact.get(contactValue) ?? null;
        return this.prisma.blockedContact.upsert({
          where: { userId_contactValue: { userId, contactValue } },
          create: { userId, contactValue, blockedUserId },
          update: { blockedUserId },
        });
      }),
    );

    return { totalSubmitted: normalized.length, matchedUsers: matchedUserIdByContact.size };
  }

  async listBlockedContacts(userId: string): Promise<BlockedContactView[]> {
    const blocked = await this.prisma.blockedContact.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const blockedUserIds = blocked
      .map((contact) => contact.blockedUserId)
      .filter((id): id is string => id != null);
    const users =
      blockedUserIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: blockedUserIds } },
            select: { id: true, name: true, profilePhotoUrl: true },
          })
        : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    return blocked.map((contact) => {
      const user = contact.blockedUserId ? userById.get(contact.blockedUserId) : undefined;
      return {
        id: contact.id,
        contactValue: contact.contactValue,
        blockedUserId: contact.blockedUserId,
        blockedUserName: user?.name ?? null,
        blockedUserPhotoUrl: user?.profilePhotoUrl ?? null,
        createdAt: contact.createdAt.toISOString(),
      };
    });
  }

  async unblockContact(userId: string, blockedContactId: string): Promise<void> {
    const record = await this.prisma.blockedContact.findUnique({ where: { id: blockedContactId } });
    if (!record || record.userId !== userId) {
      throw new NotFoundException('Blocked contact not found.');
    }

    await this.prisma.blockedContact.delete({ where: { id: blockedContactId } });
  }
}
