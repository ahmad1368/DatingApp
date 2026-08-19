import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isWoman } from './messaging.constants';

export interface MatchStatus {
  matchId: string;
  expiresAt: string | null;
  isExpired: boolean;
  firstMessageSent: boolean;
  canSendFirstMessage: boolean;
}

export interface MessageView {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface MatchSummaryView {
  matchId: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserPhotoUrl: string | null;
  expiresAt: string | null;
  firstMessageSent: boolean;
  createdAt: string;
}

interface MatchRecord {
  id: string;
  userAId: string;
  userBId: string;
  firstMessageExpiresAt: Date;
  firstMessageSentAt: Date | null;
}

interface MatchListRecord extends MatchRecord {
  createdAt: Date;
}

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async getMatchStatus(userId: string, matchId: string): Promise<MatchStatus> {
    const match = await this.getMatchForUser(userId, matchId);
    const now = new Date();
    const firstMessageSent = match.firstMessageSentAt != null;
    const expired = this.isExpired(match, now);

    const canSendFirstMessage = firstMessageSent
      ? true
      : expired
        ? false
        : await this.senderMaySendFirstMessage(userId, match);

    return {
      matchId: match.id,
      expiresAt: firstMessageSent ? null : match.firstMessageExpiresAt.toISOString(),
      isExpired: expired,
      firstMessageSent,
      canSendFirstMessage,
    };
  }

  async sendMessage(userId: string, matchId: string, content: string): Promise<MessageView> {
    const match = await this.getMatchForUser(userId, matchId);
    const now = new Date();

    if (this.isExpired(match, now)) {
      throw new BadRequestException(
        'This match has expired because no message was sent within 24 hours.',
      );
    }

    const firstMessageSent = match.firstMessageSentAt != null;
    if (!firstMessageSent) {
      const allowed = await this.senderMaySendFirstMessage(userId, match);
      if (!allowed) {
        throw new ForbiddenException('Only she can send the first message for this match.');
      }
    }

    const message = await this.prisma.message.create({
      data: { matchId, senderId: userId, content },
    });

    if (!firstMessageSent) {
      await this.prisma.match.update({
        where: { id: matchId },
        data: { firstMessageSentAt: now },
      });
    }

    return this.toMessageView(message);
  }

  async listMessages(userId: string, matchId: string): Promise<MessageView[]> {
    await this.getMatchForUser(userId, matchId);

    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((message) => this.toMessageView(message));
  }

  /**
   * Lists the current user's active matches. Any match whose 24-hour first
   * message window has passed with no message ever sent is dissolved here
   * (the match and the underlying swipes are deleted, so the two users
   * become rediscoverable) rather than merely marked expired.
   */
  async listMyMatches(userId: string): Promise<MatchSummaryView[]> {
    const matches: MatchListRecord[] = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const alive: MatchListRecord[] = [];

    for (const match of matches) {
      if (this.isExpired(match, now)) {
        await this.dissolveExpiredMatch(match);
        continue;
      }
      alive.push(match);
    }

    if (alive.length === 0) {
      return [];
    }

    const otherUserIds = alive.map((match) => (match.userAId === userId ? match.userBId : match.userAId));
    const otherUsers = await this.prisma.user.findMany({
      where: { id: { in: otherUserIds } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const otherUserById = new Map(otherUsers.map((user) => [user.id, user]));

    return alive.map((match) => {
      const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
      const otherUser = otherUserById.get(otherUserId);
      const firstMessageSent = match.firstMessageSentAt != null;

      return {
        matchId: match.id,
        otherUserId,
        otherUserName: otherUser?.name ?? null,
        otherUserPhotoUrl: otherUser?.profilePhotoUrl ?? null,
        expiresAt: firstMessageSent ? null : match.firstMessageExpiresAt.toISOString(),
        firstMessageSent,
        createdAt: match.createdAt.toISOString(),
      };
    });
  }

  private async dissolveExpiredMatch(match: MatchRecord): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.swipe.deleteMany({
        where: {
          OR: [
            { swiperId: match.userAId, targetUserId: match.userBId },
            { swiperId: match.userBId, targetUserId: match.userAId },
          ],
        },
      }),
      this.prisma.match.delete({ where: { id: match.id } }),
    ]);
  }

  private async getMatchForUser(userId: string, matchId: string): Promise<MatchRecord> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });

    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }

    return match;
  }

  private isExpired(match: MatchRecord, now: Date): boolean {
    return match.firstMessageSentAt == null && now > match.firstMessageExpiresAt;
  }

  private async senderMaySendFirstMessage(senderId: string, match: MatchRecord): Promise<boolean> {
    const otherId = match.userAId === senderId ? match.userBId : match.userAId;

    const [sender, other] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: senderId }, select: { genderIdentities: true } }),
      this.prisma.user.findUnique({ where: { id: otherId }, select: { genderIdentities: true } }),
    ]);

    if (isWoman(sender?.genderIdentities ?? [])) {
      return true;
    }

    return !isWoman(other?.genderIdentities ?? []);
  }

  private toMessageView(message: {
    id: string;
    senderId: string;
    content: string;
    createdAt: Date;
  }): MessageView {
    return {
      id: message.id,
      senderId: message.senderId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
