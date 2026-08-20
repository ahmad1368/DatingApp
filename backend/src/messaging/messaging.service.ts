import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findIcebreakerPrompt, ICEBREAKER_PROMPTS, IcebreakerPrompt, isWoman } from './messaging.constants';

export interface MatchStatus {
  matchId: string;
  expiresAt: string | null;
  isExpired: boolean;
  firstMessageSent: boolean;
  canSendFirstMessage: boolean;
}

export interface IcebreakerView {
  promptId: string;
  question: string;
  optionA: string;
  optionB: string;
  myOptionIndex: number | null;
  otherOptionIndex: number | null;
}

export interface MessageView {
  id: string;
  senderId: string;
  contentType: string;
  content: string | null;
  mediaUrl: string | null;
  isBlurred: boolean;
  readAt: string | null;
  icebreaker: IcebreakerView | null;
  createdAt: string;
}

export interface ReadReceiptsResult {
  readReceiptsEnabled: boolean;
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
    const { firstMessageSent } = await this.assertCanSend(userId, matchId);

    const message = await this.prisma.message.create({
      data: { matchId, senderId: userId, contentType: 'TEXT', content },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);

    return this.toMessageView(message, userId);
  }

  /**
   * Sends an image or GIF in-chat, subject to the same match-expiry and
   * women-first-message rules as a text message. Images default to
   * blurred; the recipient must explicitly reveal them via [revealImage].
   */
  async sendMediaMessage(
    userId: string,
    matchId: string,
    contentType: string,
    mediaUrl: string,
  ): Promise<MessageView> {
    const { firstMessageSent } = await this.assertCanSend(userId, matchId);

    const message = await this.prisma.message.create({
      data: {
        matchId,
        senderId: userId,
        contentType,
        mediaUrl,
        isBlurred: contentType === 'IMAGE',
      },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);

    return this.toMessageView(message, userId);
  }

  async revealImage(userId: string, matchId: string, messageId: string): Promise<MessageView> {
    await this.getMatchForUser(userId, matchId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.matchId !== matchId) {
      throw new NotFoundException('Message not found.');
    }
    if (message.senderId === userId) {
      throw new ForbiddenException('Only the recipient can reveal a blurred photo.');
    }
    if (message.contentType !== 'IMAGE' || !message.isBlurred) {
      return this.toMessageView(message, userId);
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { isBlurred: false },
    });

    return this.toMessageView(updated, userId);
  }

  /**
   * Listing a conversation doubles as "opening" it: any of the other
   * person's messages that aren't marked read yet get stamped now, unless
   * the current user has turned off read receipts (see
   * [setReadReceiptsEnabled]) - in that case their reads never show up to
   * the sender, mirroring how the toggle behaves elsewhere in the app.
   */
  async listMessages(userId: string, matchId: string): Promise<MessageView[]> {
    await this.getMatchForUser(userId, matchId);

    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
    });

    const responsesByMessageId = await this.getIcebreakerResponsesByMessage(
      messages.filter((message) => message.contentType === 'ICEBREAKER').map((message) => message.id),
    );

    const unreadIncomingIds = messages
      .filter((message) => message.senderId !== userId && message.readAt == null)
      .map((message) => message.id);

    let readAt: Date | null = null;
    if (unreadIncomingIds.length > 0) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { readReceiptsEnabled: true },
      });
      if (currentUser?.readReceiptsEnabled) {
        readAt = new Date();
        await this.prisma.message.updateMany({
          where: { id: { in: unreadIncomingIds } },
          data: { readAt },
        });
      }
    }
    const unreadIdSet = new Set(unreadIncomingIds);

    return messages.map((message) =>
      this.toMessageView(
        readAt && unreadIdSet.has(message.id) ? { ...message, readAt } : message,
        userId,
        responsesByMessageId.get(message.id) ?? [],
      ),
    );
  }

  /**
   * In-chat icebreaker: a two-option question card either person can send
   * to spark conversation before meeting. Subject to the same match-expiry
   * and women-first-message rules as any other message.
   */
  async sendIcebreaker(userId: string, matchId: string, promptId: string): Promise<MessageView> {
    const prompt = findIcebreakerPrompt(promptId);
    if (!prompt) {
      throw new BadRequestException('Unknown icebreaker prompt.');
    }

    const { firstMessageSent } = await this.assertCanSend(userId, matchId);

    const message = await this.prisma.message.create({
      data: { matchId, senderId: userId, contentType: 'ICEBREAKER', content: promptId },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);

    return this.toMessageView(message, userId);
  }

  /**
   * Answers an icebreaker card. Each side's pick is stored independently;
   * [toMessageView] only ever reveals it as "myOptionIndex"/"otherOptionIndex"
   * from the current viewer's perspective, not by absolute option.
   */
  async respondToIcebreaker(
    userId: string,
    matchId: string,
    messageId: string,
    optionIndex: number,
  ): Promise<MessageView> {
    await this.getMatchForUser(userId, matchId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.matchId !== matchId || message.contentType !== 'ICEBREAKER') {
      throw new NotFoundException('Icebreaker not found.');
    }

    await this.prisma.icebreakerResponse.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, optionIndex },
      update: { optionIndex },
    });

    const responses = await this.prisma.icebreakerResponse.findMany({ where: { messageId } });

    return this.toMessageView(message, userId, responses);
  }

  getIcebreakerPrompts(): IcebreakerPrompt[] {
    return ICEBREAKER_PROMPTS;
  }

  /**
   * Privacy toggle: when disabled, the current user's reads of other
   * people's messages are never stamped, so senders never see their
   * messages as read. Does not affect whether this user can see read
   * receipts on messages they sent while receipts were enabled.
   */
  async setReadReceiptsEnabled(userId: string, enabled: boolean): Promise<ReadReceiptsResult> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { readReceiptsEnabled: enabled },
    });

    return { readReceiptsEnabled: updated.readReceiptsEnabled };
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

  private async assertCanSend(
    userId: string,
    matchId: string,
  ): Promise<{ match: MatchRecord; firstMessageSent: boolean }> {
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

    return { match, firstMessageSent };
  }

  private async markFirstMessageIfNeeded(matchId: string, firstMessageSent: boolean): Promise<void> {
    if (firstMessageSent) {
      return;
    }
    await this.prisma.match.update({
      where: { id: matchId },
      data: { firstMessageSentAt: new Date() },
    });
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

  private async getIcebreakerResponsesByMessage(
    messageIds: string[],
  ): Promise<Map<string, { userId: string; optionIndex: number }[]>> {
    const responsesByMessageId = new Map<string, { userId: string; optionIndex: number }[]>();
    if (messageIds.length === 0) {
      return responsesByMessageId;
    }

    const responses = await this.prisma.icebreakerResponse.findMany({
      where: { messageId: { in: messageIds } },
    });
    for (const response of responses) {
      const list = responsesByMessageId.get(response.messageId) ?? [];
      list.push({ userId: response.userId, optionIndex: response.optionIndex });
      responsesByMessageId.set(response.messageId, list);
    }
    return responsesByMessageId;
  }

  private toMessageView(
    message: {
      id: string;
      senderId: string;
      contentType: string;
      content: string | null;
      mediaUrl: string | null;
      isBlurred: boolean;
      readAt: Date | null;
      createdAt: Date;
    },
    userId: string,
    icebreakerResponses: { userId: string; optionIndex: number }[] = [],
  ): MessageView {
    return {
      id: message.id,
      senderId: message.senderId,
      contentType: message.contentType,
      content: message.content,
      mediaUrl: message.mediaUrl,
      isBlurred: message.isBlurred,
      readAt: message.readAt ? message.readAt.toISOString() : null,
      icebreaker: this.toIcebreakerView(message.contentType, message.content, userId, icebreakerResponses),
      createdAt: message.createdAt.toISOString(),
    };
  }

  private toIcebreakerView(
    contentType: string,
    promptId: string | null,
    userId: string,
    responses: { userId: string; optionIndex: number }[],
  ): IcebreakerView | null {
    if (contentType !== 'ICEBREAKER' || !promptId) {
      return null;
    }
    const prompt = findIcebreakerPrompt(promptId);
    if (!prompt) {
      return null;
    }

    const myResponse = responses.find((response) => response.userId === userId);
    const otherResponse = responses.find((response) => response.userId !== userId);

    return {
      promptId: prompt.id,
      question: prompt.question,
      optionA: prompt.optionA,
      optionB: prompt.optionB,
      myOptionIndex: myResponse?.optionIndex ?? null,
      otherOptionIndex: otherResponse?.optionIndex ?? null,
    };
  }
}
