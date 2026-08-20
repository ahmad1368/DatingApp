import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONTENT_MODERATOR,
  ContentModerator,
  ModerationResult,
} from './interfaces/content-moderator.interface';

export interface MessageReportView {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  moderationFlagged: boolean;
  moderationCategories: string[];
  createdAt: string;
}

@Injectable()
export class MessageModerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_MODERATOR) private readonly contentModerator: ContentModerator,
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
}
