import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContentModerator } from './interfaces/content-moderator.interface';
import { MessagingService } from './messaging.service';
import { MessageModerationService } from './message-moderation.service';

const REPORTER_ID = 'user-1';
const OTHER_ID = 'user-2';
const OUTSIDER_ID = 'user-3';
const MATCH_ID = 'match-1';
const MESSAGE_ID = 'message-1';

describe('MessageModerationService', () => {
  let service: MessageModerationService;
  let prisma: {
    match: { findUnique: jest.Mock };
    message: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    messageReport: { create: jest.Mock };
    matchReport: { create: jest.Mock };
  };
  let contentModerator: { moderate: jest.Mock };
  let messagingService: { unmatch: jest.Mock };
  let notificationsService: { notify: jest.Mock };

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn() },
      message: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      messageReport: { create: jest.fn() },
      matchReport: { create: jest.fn() },
    };
    contentModerator = { moderate: jest.fn() };
    messagingService = { unmatch: jest.fn() };
    notificationsService = { notify: jest.fn() };
    service = new MessageModerationService(
      prisma as unknown as PrismaService,
      contentModerator as unknown as ContentModerator,
      messagingService as unknown as MessagingService,
      notificationsService as unknown as NotificationsService,
    );
  });

  describe('checkText', () => {
    it('delegates directly to the content moderator', async () => {
      contentModerator.moderate.mockResolvedValue({ flagged: true, categories: ['harassment'] });

      const result = await service.checkText('you are the worst');

      expect(contentModerator.moderate).toHaveBeenCalledWith('you are the worst');
      expect(result).toEqual({ flagged: true, categories: ['harassment'] });
    });
  });

  describe('reportMessage', () => {
    it('throws when the reporter is not part of the match', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: MATCH_ID,
        userAId: REPORTER_ID,
        userBId: OTHER_ID,
      });

      await expect(
        service.reportMessage(OUTSIDER_ID, MATCH_ID, MESSAGE_ID, 'harassing me'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.messageReport.create).not.toHaveBeenCalled();
    });

    it('throws when the message does not belong to the match', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: MATCH_ID,
        userAId: REPORTER_ID,
        userBId: OTHER_ID,
      });
      prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        matchId: 'other-match',
        content: 'hi',
      });

      await expect(
        service.reportMessage(REPORTER_ID, MATCH_ID, MESSAGE_ID, 'harassing me'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('moderates the reported text and persists the report', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: MATCH_ID,
        userAId: REPORTER_ID,
        userBId: OTHER_ID,
      });
      prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        matchId: MATCH_ID,
        content: 'you are worthless',
      });
      contentModerator.moderate.mockResolvedValue({ flagged: true, categories: ['harassment'] });
      prisma.messageReport.create.mockResolvedValue({
        id: 'report-1',
        messageId: MESSAGE_ID,
        reporterId: REPORTER_ID,
        reason: 'harassing me',
        moderationFlagged: true,
        moderationCategories: ['harassment'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.reportMessage(REPORTER_ID, MATCH_ID, MESSAGE_ID, 'harassing me');

      expect(contentModerator.moderate).toHaveBeenCalledWith('you are worthless');
      expect(prisma.messageReport.create).toHaveBeenCalledWith({
        data: {
          messageId: MESSAGE_ID,
          reporterId: REPORTER_ID,
          reason: 'harassing me',
          moderationFlagged: true,
          moderationCategories: ['harassment'],
        },
      });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: MESSAGE_ID },
        data: { moderationRemovedAt: expect.any(Date) },
      });
      expect(notificationsService.notify).toHaveBeenCalledWith(
        REPORTER_ID,
        'REPORT_RESOLVED',
        'Report resolved',
        'The message you reported was removed for violating our guidelines.',
        { matchId: MATCH_ID, messageId: MESSAGE_ID, outcome: 'CONTENT_REMOVED' },
      );
      expect(result).toEqual({
        id: 'report-1',
        messageId: MESSAGE_ID,
        reporterId: REPORTER_ID,
        reason: 'harassing me',
        moderationFlagged: true,
        moderationCategories: ['harassment'],
        outcome: 'CONTENT_REMOVED',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('does not remove content or notify when no violation is found', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: MATCH_ID,
        userAId: REPORTER_ID,
        userBId: OTHER_ID,
      });
      prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        matchId: MATCH_ID,
        content: 'hey, how are you?',
      });
      contentModerator.moderate.mockResolvedValue({ flagged: false, categories: [] });
      prisma.messageReport.create.mockResolvedValue({
        id: 'report-3',
        messageId: MESSAGE_ID,
        reporterId: REPORTER_ID,
        reason: 'just being annoying',
        moderationFlagged: false,
        moderationCategories: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.reportMessage(REPORTER_ID, MATCH_ID, MESSAGE_ID, 'just being annoying');

      expect(prisma.message.update).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(result.outcome).toBe('NO_VIOLATION_FOUND');
    });

    it('skips moderation for a media message with no text content', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: MATCH_ID,
        userAId: REPORTER_ID,
        userBId: OTHER_ID,
      });
      prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        matchId: MATCH_ID,
        content: null,
      });
      prisma.messageReport.create.mockResolvedValue({
        id: 'report-2',
        messageId: MESSAGE_ID,
        reporterId: REPORTER_ID,
        reason: 'inappropriate photo',
        moderationFlagged: false,
        moderationCategories: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.reportMessage(
        REPORTER_ID,
        MATCH_ID,
        MESSAGE_ID,
        'inappropriate photo',
      );

      expect(contentModerator.moderate).not.toHaveBeenCalled();
      expect(result.moderationFlagged).toBe(false);
    });
  });

  describe('reportAndUnmatch', () => {
    it('throws when the reporter is not part of the match', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: REPORTER_ID, userBId: OTHER_ID });

      await expect(
        service.reportAndUnmatch(OUTSIDER_ID, MATCH_ID, 'HARASSMENT'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.matchReport.create).not.toHaveBeenCalled();
      expect(messagingService.unmatch).not.toHaveBeenCalled();
    });

    it('snapshots the chat log, moderates the combined text, and unmatches', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: REPORTER_ID, userBId: OTHER_ID });
      prisma.message.findMany.mockResolvedValue([
        {
          senderId: OTHER_ID,
          contentType: 'TEXT',
          content: 'you are worthless',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          senderId: REPORTER_ID,
          contentType: 'IMAGE',
          content: null,
          createdAt: new Date('2026-01-01T00:01:00.000Z'),
        },
      ]);
      contentModerator.moderate.mockResolvedValue({ flagged: true, categories: ['harassment'] });
      prisma.matchReport.create.mockResolvedValue({
        id: 'report-1',
        matchId: MATCH_ID,
        reportedUserId: OTHER_ID,
        reason: 'HARASSMENT',
        details: 'kept insulting me',
        moderationFlagged: true,
        moderationCategories: ['harassment'],
        createdAt: new Date('2026-01-01T00:02:00.000Z'),
      });

      const result = await service.reportAndUnmatch(REPORTER_ID, MATCH_ID, 'HARASSMENT', 'kept insulting me');

      expect(contentModerator.moderate).toHaveBeenCalledWith('you are worthless');
      expect(prisma.matchReport.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          reporterId: REPORTER_ID,
          reportedUserId: OTHER_ID,
          reason: 'HARASSMENT',
          details: 'kept insulting me',
          chatLog: [
            {
              senderId: OTHER_ID,
              contentType: 'TEXT',
              content: 'you are worthless',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
              senderId: REPORTER_ID,
              contentType: 'IMAGE',
              content: null,
              createdAt: '2026-01-01T00:01:00.000Z',
            },
          ],
          moderationFlagged: true,
          moderationCategories: ['harassment'],
        },
      });
      expect(messagingService.unmatch).toHaveBeenCalledWith(REPORTER_ID, MATCH_ID);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        REPORTER_ID,
        'REPORT_RESOLVED',
        'Report resolved',
        'Your report was confirmed and the conversation was removed for violating our guidelines.',
        { matchId: MATCH_ID, outcome: 'CONTENT_REMOVED' },
      );
      expect(result).toEqual({
        id: 'report-1',
        matchId: MATCH_ID,
        reportedUserId: OTHER_ID,
        reason: 'HARASSMENT',
        details: 'kept insulting me',
        moderationFlagged: true,
        moderationCategories: ['harassment'],
        outcome: 'CONTENT_REMOVED',
        createdAt: '2026-01-01T00:02:00.000Z',
      });
    });

    it('skips moderation when the conversation has no text content', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: REPORTER_ID, userBId: OTHER_ID });
      prisma.message.findMany.mockResolvedValue([
        { senderId: OTHER_ID, contentType: 'IMAGE', content: null, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      prisma.matchReport.create.mockResolvedValue({
        id: 'report-2',
        matchId: MATCH_ID,
        reportedUserId: OTHER_ID,
        reason: 'OTHER',
        details: null,
        moderationFlagged: false,
        moderationCategories: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.reportAndUnmatch(REPORTER_ID, MATCH_ID, 'OTHER');

      expect(contentModerator.moderate).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(result.moderationFlagged).toBe(false);
      expect(result.outcome).toBe('NO_VIOLATION_FOUND');
    });
  });
});
