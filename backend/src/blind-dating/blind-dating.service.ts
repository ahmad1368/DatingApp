import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';
import { computeSessionExpiresAt } from './blind-dating.constants';

export type BlindDateStatus = 'NONE' | 'WAITING' | 'ACTIVE' | 'ENDED';

export interface RevealedProfile {
  id: string;
  name: string | null;
  profilePhotoUrl: string | null;
}

export interface BlindDateStatusView {
  status: BlindDateStatus;
  sessionId: string | null;
  expiresAt: string | null;
  isRevealed: boolean;
  myRevealRequested: boolean;
  otherRevealRequested: boolean;
  otherProfile: RevealedProfile | null;
}

export interface BlindDateMessageView {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface SessionRecord {
  id: string;
  userAId: string;
  userBId: string;
  expiresAt: Date;
  userARevealRequested: boolean;
  userBRevealRequested: boolean;
  revealedAt: Date | null;
}

@Injectable()
export class BlindDatingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Joins the matchmaking queue: pairs with the longest-waiting eligible
   * stranger if one exists (mutual blocks are excluded, same as the main
   * discovery deck), otherwise starts waiting. Refuses if the user already
   * has an active session - leave/finish that first.
   */
  async joinQueue(userId: string): Promise<BlindDateStatusView> {
    const activeSession = await this.findMostRecentSession(userId);
    if (activeSession && !this.isExpired(activeSession)) {
      throw new BadRequestException('You already have an active blind date session.');
    }

    const existingQueueEntry = await this.prisma.blindDateQueueEntry.findUnique({
      where: { userId },
    });
    if (existingQueueEntry) {
      return this.getStatus(userId);
    }

    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const waitingPartner = await this.prisma.blindDateQueueEntry.findFirst({
      where: { userId: { notIn: [userId, ...blockedIds] } },
      orderBy: { joinedAt: 'asc' },
    });

    if (!waitingPartner) {
      await this.prisma.blindDateQueueEntry.create({ data: { userId } });
      return this.getStatus(userId);
    }

    const [userAId, userBId] = [userId, waitingPartner.userId].sort();
    await this.prisma.$transaction([
      this.prisma.blindDateQueueEntry.delete({ where: { userId: waitingPartner.userId } }),
      this.prisma.blindDateSession.create({
        data: { userAId, userBId, expiresAt: computeSessionExpiresAt(new Date()) },
      }),
    ]);

    return this.getStatus(userId);
  }

  async leaveQueue(userId: string): Promise<void> {
    await this.prisma.blindDateQueueEntry.deleteMany({ where: { userId } });
  }

  async getStatus(userId: string): Promise<BlindDateStatusView> {
    const session = await this.findMostRecentSession(userId);
    if (session && !this.isExpired(session)) {
      return this.toStatusView(userId, session, 'ACTIVE');
    }

    const queueEntry = await this.prisma.blindDateQueueEntry.findUnique({ where: { userId } });
    if (queueEntry) {
      return {
        status: 'WAITING',
        sessionId: null,
        expiresAt: null,
        isRevealed: false,
        myRevealRequested: false,
        otherRevealRequested: false,
        otherProfile: null,
      };
    }

    if (session) {
      return this.toStatusView(userId, session, 'ENDED');
    }

    return {
      status: 'NONE',
      sessionId: null,
      expiresAt: null,
      isRevealed: false,
      myRevealRequested: false,
      otherRevealRequested: false,
      otherProfile: null,
    };
  }

  async sendMessage(userId: string, sessionId: string, content: string): Promise<BlindDateMessageView> {
    const session = await this.getOwnedSession(userId, sessionId);
    if (this.isExpired(session)) {
      throw new BadRequestException('This blind date session has ended.');
    }

    const message = await this.prisma.blindDateMessage.create({
      data: { sessionId, senderId: userId, content },
    });

    return {
      id: message.id,
      senderId: message.senderId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async listMessages(userId: string, sessionId: string): Promise<BlindDateMessageView[]> {
    await this.getOwnedSession(userId, sessionId);

    const messages = await this.prisma.blindDateMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  /**
   * Requests to reveal profiles. Once both sides have requested it, the
   * session is marked revealed and each side's response includes the
   * other's name/photo for the first time.
   */
  async requestReveal(userId: string, sessionId: string): Promise<BlindDateStatusView> {
    const session = await this.getOwnedSession(userId, sessionId);
    const isUserA = session.userAId === userId;

    const updated = await this.prisma.blindDateSession.update({
      where: { id: sessionId },
      data: isUserA ? { userARevealRequested: true } : { userBRevealRequested: true },
    });

    const bothRequested = updated.userARevealRequested && updated.userBRevealRequested;
    const finalSession =
      bothRequested && !updated.revealedAt
        ? await this.prisma.blindDateSession.update({
            where: { id: sessionId },
            data: { revealedAt: new Date() },
          })
        : updated;

    return this.toStatusView(userId, finalSession, this.isExpired(finalSession) ? 'ENDED' : 'ACTIVE');
  }

  private async getOwnedSession(userId: string, sessionId: string): Promise<SessionRecord> {
    const session = await this.prisma.blindDateSession.findUnique({ where: { id: sessionId } });
    if (!session || (session.userAId !== userId && session.userBId !== userId)) {
      throw new NotFoundException('Blind date session not found.');
    }
    return session;
  }

  private async findMostRecentSession(userId: string): Promise<SessionRecord | null> {
    return this.prisma.blindDateSession.findFirst({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { startedAt: 'desc' },
    });
  }

  private isExpired(session: SessionRecord): boolean {
    return new Date() > session.expiresAt;
  }

  private async toStatusView(
    userId: string,
    session: SessionRecord,
    status: BlindDateStatus,
  ): Promise<BlindDateStatusView> {
    const isUserA = session.userAId === userId;
    const myRevealRequested = isUserA ? session.userARevealRequested : session.userBRevealRequested;
    const otherRevealRequested = isUserA ? session.userBRevealRequested : session.userARevealRequested;
    const isRevealed = session.revealedAt != null;
    const otherUserId = isUserA ? session.userBId : session.userAId;

    let otherProfile: RevealedProfile | null = null;
    if (isRevealed) {
      const otherUser = await this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: { id: true, name: true, profilePhotoUrl: true },
      });
      if (otherUser) {
        otherProfile = otherUser;
      }
    }

    return {
      status,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
      isRevealed,
      myRevealRequested,
      otherRevealRequested,
      otherProfile,
    };
  }
}
