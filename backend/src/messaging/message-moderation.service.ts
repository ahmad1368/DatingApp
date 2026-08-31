import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CONTENT_MODERATOR,
  ContentModerator,
  ModerationResult,
} from './interfaces/content-moderator.interface';
import { MessagingService } from './messaging.service';

export type ReportOutcome = 'CONTENT_REMOVED' | 'NO_VIOLATION_FOUND';

export interface MessageReportView {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  moderationFlagged: boolean;
  moderationCategories: string[];
  outcome: ReportOutcome;
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
  outcome: ReportOutcome;
  createdAt: string;
}

@Injectable()
export class MessageModerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_MODERATOR) private readonly contentModerator: ContentModerator,
    private readonly messagingService: MessagingService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Real-time pre-send check: the client calls this with a draft message so
   * it can prompt the user before they actually send something the AI
   * moderator flags as potentially harassing or harmful.
   */
  async checkText(text: string): Promise<ModerationResult> {
    return this.contentModerator.moderate(text);
  }

  /**
   * Reports a message and, if the AI moderator confirms it violates
   * guidelines, immediately removes its content and notifies the reporter -
   * closing the feedback loop instead of the report just sitting logged
   * with no visible outcome. See MessagingService.toMessageView for how
   * moderationRemovedAt withholds content/mediaUrl from everyone once set.
   */
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

    const outcome: ReportOutcome = moderation.flagged ? 'CONTENT_REMOVED' : 'NO_VIOLATION_FOUND';
    if (moderation.flagged && message.moderationRemovedAt == null) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { moderationRemovedAt: new Date() },
      });
      await this.notificationsService.notify(
        reporterId,
        'REPORT_RESOLVED',
        'Report resolved',
        'The message you reported was removed for violating our guidelines.',
        { matchId, messageId, outcome },
      );
    }

    return {
      id: report.id,
      messageId: report.messageId,
      reporterId: report.reporterId,
      reason: report.reason,
      moderationFlagged: report.moderationFlagged,
      moderationCategories: report.moderationCategories,
      outcome,
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

    const outcome: ReportOutcome = moderation.flagged ? 'CONTENT_REMOVED' : 'NO_VIOLATION_FOUND';
    if (moderation.flagged) {
      await this.notificationsService.notify(
        reporterId,
        'REPORT_RESOLVED',
        'Report resolved',
        'Your report was confirmed and the conversation was removed for violating our guidelines.',
        { matchId, outcome },
      );
    }

    return {
      id: report.id,
      matchId: report.matchId,
      reportedUserId: report.reportedUserId,
      reason: report.reason,
      outcome,
      details: report.details,
      moderationFlagged: report.moderationFlagged,
      moderationCategories: report.moderationCategories,
      createdAt: report.createdAt.toISOString(),
    };
  }
}
