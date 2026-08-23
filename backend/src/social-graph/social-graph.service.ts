import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SyncSocialContactsResult {
  totalSynced: number;
}

export interface MutualFriendView {
  userId: string;
  name: string | null;
  photoUrl: string | null;
}

export interface MutualConnectionsResult {
  mutualContactCount: number;
  mutualFriends: MutualFriendView[];
}

/**
 * A user's own address book (phone numbers/emails), synced separately from
 * BlockedContact (which tracks people to exclude). Overlap between two
 * users' synced contacts is treated as a "mutual friend" signal - people
 * both of them know, whether or not that contact has an account here.
 */
@Injectable()
export class SocialGraphService {
  constructor(private readonly prisma: PrismaService) {}

  /** Full replace: a stale contact removed from the address book should stop counting as mutual. */
  async syncContacts(userId: string, contacts: string[]): Promise<SyncSocialContactsResult> {
    const normalized = [
      ...new Set(contacts.map((contact) => contact.trim().toLowerCase()).filter((contact) => contact.length > 0)),
    ];

    await this.prisma.$transaction([
      this.prisma.socialContact.deleteMany({ where: { userId } }),
      ...(normalized.length > 0
        ? [
            this.prisma.socialContact.createMany({
              data: normalized.map((contactValue) => ({ userId, contactValue })),
            }),
          ]
        : []),
    ]);

    return { totalSynced: normalized.length };
  }

  async getMutualConnections(userId: string, otherUserId: string): Promise<MutualConnectionsResult> {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot compare mutual connections with yourself.');
    }

    const otherUser = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!otherUser) {
      throw new NotFoundException('User not found.');
    }

    const [myContacts, theirContacts] = await Promise.all([
      this.prisma.socialContact.findMany({ where: { userId }, select: { contactValue: true } }),
      this.prisma.socialContact.findMany({
        where: { userId: otherUserId },
        select: { contactValue: true },
      }),
    ]);

    const theirContactValues = new Set(theirContacts.map((c) => c.contactValue));
    const sharedContactValues = [
      ...new Set(myContacts.map((c) => c.contactValue).filter((value) => theirContactValues.has(value))),
    ];

    if (sharedContactValues.length === 0) {
      return { mutualContactCount: 0, mutualFriends: [] };
    }

    const matchedUsers = await this.prisma.user.findMany({
      where: {
        id: { notIn: [userId, otherUserId] },
        OR: [
          { phoneNumber: { in: sharedContactValues } },
          { email: { in: sharedContactValues } },
        ],
      },
      select: { id: true, name: true, profilePhotoUrl: true },
    });

    return {
      mutualContactCount: sharedContactValues.length,
      mutualFriends: matchedUsers.map((user) => ({
        userId: user.id,
        name: user.name,
        photoUrl: user.profilePhotoUrl,
      })),
    };
  }
}
