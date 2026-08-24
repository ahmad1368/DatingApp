import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONTENT_MODERATOR,
  ContentModerator,
  ModerationResult,
} from './interfaces/content-moderator.interface';
import { MessagingService } from './messaging.service';

export interface MessageReportView {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  moderationFlagged: boolean;
  moderationCategories: string[];
  createdAt: string;
}

export interface MatchReportView {
  id: string;
  matchId: string;
  reportedUserId: string;
  reason: string;
  details: string | null;
  moderationFlagged: boolean;
  moderationCategories: string[];
  createdAt: string;
}

@Injectable()
export class MessageModerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_MODERATOR) private readonly contentModerator: ContentModerator,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * Real-time pre-send check: the client calls this with a draft message so
   * it can prompt the user before they actually send something the AI
   * moderator flags as potentially harassing or harmful.
   */
  async checkText(text: string): Promise<ModerationResult> {
    return this.contentModerator.moderate(text);
  }

  async reportMessage(
    reporterId: string,
    matchId: string,
    messageId: string,
    reason: string,
  ): Promise<MessageReportView> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== reporterId && match.userBId !== reporterId)) {
      throw new NotFoundException('Match not found.');
    }

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.matchId !== matchId) {
      throw new NotFoundException('Message not found.');
    }

    const moderation: ModerationResult = message.content
      ? await this.contentModerator.moderate(message.content)
      : { flagged: false, categories: [] };

    const report = await this.prisma.messageReport.create({
      data: {
        messageId,
        reporterId,
        reason,
        moderationFlagged: moderation.flagged,
        moderationCategories: moderation.categories,
      },
    });

    return {
      id: report.id,
      messageId: report.messageId,
      reporterId: report.reporterId,
      reason: report.reason,
      moderationFlagged: report.moderationFlagged,
      moderationCategories: report.moderationCategories,
      createdAt: report.createdAt.toISOString(),
    };
  }

  /**
   * The "report & unmatch" dual action: snapshots the full chat log and runs
   * it through the AI content moderator *before* handing off to
   * MessagingService.unmatch, which deletes the underlying Message rows -
   * without this, the conversation would be gone before a human moderator
   * (or the AI queue) ever saw it.
   */
  async reportAndUnmatch(
    reporterId: string,
    matchId: string,
    reason: string,
    details?: string,
  ): Promise<MatchReportView> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== reporterId && match.userBId !== reporterId)) {
      throw new NotFoundException('Match not found.');
    }
    const reportedUserId = match.userAId === reporterId ? match.userBId : match.userAId;

    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
    });

    const chatLog = messages.map((message) => ({
      senderId: message.senderId,
      contentType: message.contentType,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));

    const combinedText = messages
      .map((message) => message.content)
      .filter((content): content is string => content != null)
      .join('\n');
    const moderation: ModerationResult = combinedText
      ? await this.contentModerator.moderate(combinedText)
      : { flagged: false, categories: [] };

    const report = await this.prisma.matchReport.create({
      data: {
        matchId,
        reporterId,
        reportedUserId,
        reason,
        details,
        chatLog: chatLog as unknown as Prisma.InputJsonValue,
        moderationFlagged: moderation.flagged,
        moderationCategories: moderation.categories,
      },
    });

    await this.messagingService.unmatch(reporterId, matchId);

    return {
      id: report.id,
      matchId: report.matchId,
      reportedUserId: report.reportedUserId,
      reason: report.reason,
      details: report.details,
      moderationFlagged: report.moderationFlagged,
      moderationCategories: report.moderationCategories,
      createdAt: report.createdAt.toISOString(),
    };
  }
}
