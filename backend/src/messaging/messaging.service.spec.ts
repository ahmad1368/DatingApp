import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ImageModerator } from './interfaces/image-moderator.interface';
import { MessagingService } from './messaging.service';

const MATCH_ID = 'match-1';
const WOMAN_ID = 'user-woman';
const MAN_ID = 'user-man';

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

describe('MessagingService', () => {
  let service: MessagingService;
  let prisma: {
    match: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
      create: jest.Mock;
    };
    message: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    icebreakerResponse: { findMany: jest.Mock; upsert: jest.Mock };
    swipe: { deleteMany: jest.Mock };
    dissolvedMatch: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
    matchNote: { findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
    partnerLink: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let imageModerator: { moderate: jest.Mock };
  let notificationsService: { notify: jest.Mock };

  beforeEach(() => {
    imageModerator = { moderate: jest.fn().mockResolvedValue({ flagged: false, categories: [] }) };
    notificationsService = { notify: jest.fn() };
    prisma = {
      match: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        create: jest.fn(),
      },
      message: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      icebreakerResponse: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      swipe: { deleteMany: jest.fn() },
      dissolvedMatch: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      matchNote: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      partnerLink: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new MessagingService(
      prisma as unknown as PrismaService,
      imageModerator as unknown as ImageModerator,
      notificationsService as unknown as NotificationsService,
    );
  });

  function mockMatch(overrides: Partial<{
    firstMessageExpiresAt: Date;
    firstMessageSentAt: Date | null;
    firstMessageExtendedAt: Date | null;
    verificationRequestedAt: Date | null;
    verificationRequestedById: string | null;
  }> = {}) {
    prisma.match.findUnique.mockResolvedValue({
      id: MATCH_ID,
      userAId: WOMAN_ID,
      userBId: MAN_ID,
      firstMessageExpiresAt: hoursFromNow(24),
      firstMessageSentAt: null,
      firstMessageExtendedAt: null,
      verificationRequestedAt: null,
      verificationRequestedById: null,
      ...overrides,
    });
  }

  function mockUsers(genderByUserId: Record<string, string[]>) {
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ genderIdentities: genderByUserId[where.id] ?? [] }),
    );
  }

  describe('getMatchStatus', () => {
    it('throws when the match does not exist', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(service.getMatchStatus(WOMAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(service.getMatchStatus('someone-else', MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('marks the match expired once the window passes with no first message', async () => {
      mockMatch({ firstMessageExpiresAt: hoursFromNow(-1) });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.isExpired).toBe(true);
      expect(status.canSendFirstMessage).toBe(false);
    });

    it('lets the woman send the first message', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      const status = await service.getMatchStatus(WOMAN_ID, MATCH_ID);

      expect(status.canSendFirstMessage).toBe(true);
    });

    it('blocks the man from sending the first message when matched with a woman', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.canSendFirstMessage).toBe(false);
    });

    it('allows either user to send first when neither identifies as a woman', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Man'], [MAN_ID]: ['Non-binary'] });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.canSendFirstMessage).toBe(true);
    });

    it('allows anyone to message once the first message has already been sent', async () => {
      mockMatch({ firstMessageSentAt: new Date() });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.firstMessageSent).toBe(true);
      expect(status.canSendFirstMessage).toBe(true);
      expect(status.expiresAt).toBeNull();
    });

    it('reports canExtend true for an unmessaged, unexpired, not-yet-extended match', async () => {
      mockMatch();

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.canExtend).toBe(true);
    });

    it('reports canExtend false once the match has already been extended', async () => {
      mockMatch({ firstMessageExtendedAt: new Date() });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.canExtend).toBe(false);
    });

    it('reports canExtend false once the first message has been sent', async () => {
      mockMatch({ firstMessageSentAt: new Date() });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.canExtend).toBe(false);
    });

    it("surfaces the other user's active snooze status message", async () => {
      mockMatch();
      prisma.user.findUnique.mockResolvedValue({
        isVerified: false,
        snoozedUntil: new Date(Date.now() + 60_000),
        snoozeStatusMessage: 'On Vacation',
      });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.otherUserSnoozeStatusMessage).toBe('On Vacation');
    });

    it('hides the status message once the snooze has expired', async () => {
      mockMatch();
      prisma.user.findUnique.mockResolvedValue({
        isVerified: false,
        snoozedUntil: new Date(Date.now() - 60_000),
        snoozeStatusMessage: 'On Vacation',
      });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.otherUserSnoozeStatusMessage).toBeNull();
    });
  });

  describe('getMatchNote', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(service.getMatchNote('stranger', MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns null content when no note has been saved yet', async () => {
      mockMatch();
      prisma.matchNote.findUnique.mockResolvedValue(null);

      const note = await service.getMatchNote(WOMAN_ID, MATCH_ID);

      expect(note).toEqual({ content: null, updatedAt: null });
    });

    it('returns the saved note', async () => {
      mockMatch();
      prisma.matchNote.findUnique.mockResolvedValue({
        content: 'Loves hiking, mentioned a trip to Peru.',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const note = await service.getMatchNote(WOMAN_ID, MATCH_ID);

      expect(note).toEqual({
        content: 'Loves hiking, mentioned a trip to Peru.',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('setMatchNote', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(
        service.setMatchNote('stranger', MATCH_ID, 'some note'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('upserts a trimmed note', async () => {
      mockMatch();
      prisma.matchNote.upsert.mockResolvedValue({
        content: 'Loves hiking',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const note = await service.setMatchNote(WOMAN_ID, MATCH_ID, '  Loves hiking  ');

      expect(prisma.matchNote.upsert).toHaveBeenCalledWith({
        where: { userId_matchId: { userId: WOMAN_ID, matchId: MATCH_ID } },
        create: { userId: WOMAN_ID, matchId: MATCH_ID, content: 'Loves hiking' },
        update: { content: 'Loves hiking' },
      });
      expect(note).toEqual({ content: 'Loves hiking', updatedAt: '2026-01-01T00:00:00.000Z' });
    });

    it('deletes the note instead of storing blank content', async () => {
      mockMatch();

      const note = await service.setMatchNote(WOMAN_ID, MATCH_ID, '   ');

      expect(prisma.matchNote.deleteMany).toHaveBeenCalledWith({
        where: { userId: WOMAN_ID, matchId: MATCH_ID },
      });
      expect(prisma.matchNote.upsert).not.toHaveBeenCalled();
      expect(note).toEqual({ content: null, updatedAt: null });
    });
  });

  describe('extendMatchTimeLimit', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(
        service.extendMatchTimeLimit('someone-else', MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects extending once the first message has been sent', async () => {
      mockMatch({ firstMessageSentAt: new Date() });

      await expect(service.extendMatchTimeLimit(MAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('rejects extending an already-expired match', async () => {
      mockMatch({ firstMessageExpiresAt: hoursFromNow(-1) });

      await expect(service.extendMatchTimeLimit(MAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('rejects extending a match that has already been extended once', async () => {
      mockMatch({ firstMessageExtendedAt: new Date() });

      await expect(service.extendMatchTimeLimit(MAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('adds 24 hours to the expiry and records the extension', async () => {
      mockMatch();
      prisma.match.update.mockResolvedValue({
        id: MATCH_ID,
        userAId: WOMAN_ID,
        userBId: MAN_ID,
        firstMessageExpiresAt: hoursFromNow(24),
        firstMessageSentAt: null,
        firstMessageExtendedAt: new Date(),
      });

      const status = await service.extendMatchTimeLimit(MAN_ID, MATCH_ID);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: MATCH_ID },
        data: { firstMessageExpiresAt: expect.any(Date), firstMessageExtendedAt: expect.any(Date) },
      });
      expect(status.canExtend).toBe(false);
      expect(status.isExpired).toBe(false);
    });
  });

  describe('requestVerification', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(
        service.requestVerification('someone-else', MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the other user is already verified', async () => {
      mockMatch();
      prisma.user.findUnique.mockResolvedValue({ isVerified: true });

      await expect(service.requestVerification(WOMAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('rejects a duplicate request for the same match', async () => {
      mockMatch({ verificationRequestedAt: new Date(), verificationRequestedById: WOMAN_ID });
      prisma.user.findUnique.mockResolvedValue({ isVerified: false });

      await expect(service.requestVerification(WOMAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('records the request against the other (unverified) user', async () => {
      mockMatch();
      prisma.user.findUnique.mockResolvedValue({ isVerified: false });
      prisma.match.update.mockResolvedValue({
        id: MATCH_ID,
        userAId: WOMAN_ID,
        userBId: MAN_ID,
        firstMessageExpiresAt: hoursFromNow(24),
        firstMessageSentAt: null,
        firstMessageExtendedAt: null,
        verificationRequestedAt: new Date(),
        verificationRequestedById: WOMAN_ID,
      });

      const status = await service.requestVerification(WOMAN_ID, MATCH_ID);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: MATCH_ID },
        data: { verificationRequestedAt: expect.any(Date), verificationRequestedById: WOMAN_ID },
      });
      expect(status.verificationRequested).toBe(true);
      expect(status.verificationRequestedByMe).toBe(true);
      expect(status.otherUserIsVerified).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('throws when the match does not exist', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(service.sendMessage(WOMAN_ID, MATCH_ID, 'hi')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects sending after the 24-hour window expired with no first message', async () => {
      mockMatch({ firstMessageExpiresAt: hoursFromNow(-1) });

      await expect(service.sendMessage(WOMAN_ID, MATCH_ID, 'hi')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects the man sending the first message to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(service.sendMessage(MAN_ID, MATCH_ID, 'hi')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('lets the woman send the first message and marks the match as unlocked', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'TEXT',
        content: 'hi',
        mediaUrl: null,
        isBlurred: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMessage(WOMAN_ID, MATCH_ID, 'hi');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { matchId: MATCH_ID, senderId: WOMAN_ID, contentType: 'TEXT', content: 'hi' },
      });
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: MATCH_ID },
        data: { firstMessageSentAt: expect.any(Date) },
      });
      expect(notificationsService.notify).toHaveBeenCalledWith(MAN_ID, 'NEW_MESSAGE', 'New message', 'hi', {
        matchId: MATCH_ID,
      });
      expect(result).toEqual({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'TEXT',
        content: 'hi',
        mediaUrl: null,
        isBlurred: false,
        moderationFlagged: false,
        moderationCategories: [],
        voiceEffectId: null,
        backgroundSoundId: null,
        readAt: null,
        icebreaker: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('lets the man reply once the woman already sent the first message', async () => {
      mockMatch({ firstMessageSentAt: new Date() });
      prisma.message.create.mockResolvedValue({
        id: 'message-2',
        senderId: MAN_ID,
        contentType: 'TEXT',
        content: 'hey there',
        mediaUrl: null,
        isBlurred: false,
        createdAt: new Date('2026-01-01T01:00:00.000Z'),
      });

      const result = await service.sendMessage(MAN_ID, MATCH_ID, 'hey there');

      expect(prisma.match.update).not.toHaveBeenCalled();
      expect(result.senderId).toBe(MAN_ID);
    });
  });

  describe('sendMediaMessage', () => {
    it('rejects sending after the match has expired', async () => {
      mockMatch({ firstMessageExpiresAt: hoursFromNow(-1) });

      await expect(
        service.sendMediaMessage(WOMAN_ID, MATCH_ID, 'IMAGE', 'https://example.com/photo.jpg'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects the man sending the first image to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendMediaMessage(MAN_ID, MATCH_ID, 'IMAGE', 'https://example.com/photo.jpg'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sends an image blurred by default', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-3',
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMediaMessage(
        WOMAN_ID,
        MATCH_ID,
        'IMAGE',
        'https://example.com/photo.jpg',
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'IMAGE',
          mediaUrl: 'https://example.com/photo.jpg',
          isBlurred: true,
          moderationFlagged: false,
          moderationCategories: [],
        },
      });
      expect(result.isBlurred).toBe(true);
      expect(imageModerator.moderate).toHaveBeenCalledWith('https://example.com/photo.jpg');
    });

    it('flags an image the moderator detects as explicit', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      imageModerator.moderate.mockResolvedValue({ flagged: true, categories: ['sexual'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-3',
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: true,
        moderationFlagged: true,
        moderationCategories: ['sexual'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMediaMessage(
        WOMAN_ID,
        MATCH_ID,
        'IMAGE',
        'https://example.com/photo.jpg',
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'IMAGE',
          mediaUrl: 'https://example.com/photo.jpg',
          isBlurred: true,
          moderationFlagged: true,
          moderationCategories: ['sexual'],
        },
      });
      expect(result.moderationFlagged).toBe(true);
      expect(result.moderationCategories).toEqual(['sexual']);
    });

    it('sends the image unflagged when the moderation check fails', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      imageModerator.moderate.mockRejectedValue(new Error('service unavailable'));
      prisma.message.create.mockResolvedValue({
        id: 'message-3',
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: true,
        moderationFlagged: false,
        moderationCategories: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMediaMessage(
        WOMAN_ID,
        MATCH_ID,
        'IMAGE',
        'https://example.com/photo.jpg',
      );

      expect(result.moderationFlagged).toBe(false);
    });

    it('sends a GIF unblurred', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-4',
        senderId: WOMAN_ID,
        contentType: 'GIF',
        content: null,
        mediaUrl: 'https://example.com/fun.gif',
        isBlurred: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMediaMessage(
        WOMAN_ID,
        MATCH_ID,
        'GIF',
        'https://example.com/fun.gif',
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'GIF',
          mediaUrl: 'https://example.com/fun.gif',
          isBlurred: false,
          moderationFlagged: false,
          moderationCategories: [],
        },
      });
      expect(result.isBlurred).toBe(false);
      expect(imageModerator.moderate).not.toHaveBeenCalled();
    });
  });

  describe('sendVoiceNote', () => {
    it('rejects sending after the match has expired', async () => {
      mockMatch({ firstMessageExpiresAt: hoursFromNow(-1) });

      await expect(
        service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects the man sending the first voice note to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendVoiceNote(MAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a VOICE_NOTE message with its duration', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-5',
        senderId: WOMAN_ID,
        contentType: 'VOICE_NOTE',
        content: null,
        mediaUrl: 'file:///tmp/note.m4a',
        isBlurred: false,
        durationSeconds: 12,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'VOICE_NOTE',
          mediaUrl: 'file:///tmp/note.m4a',
          durationSeconds: 12,
        },
      });
      expect(result.contentType).toBe('VOICE_NOTE');
      expect(result.durationSeconds).toBe(12);
      expect(result.mediaUrl).toBe('file:///tmp/note.m4a');
      expect(result.voiceEffectId).toBeNull();
      expect(result.backgroundSoundId).toBeNull();
    });

    it('rejects an unknown voice effect', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12, 'not-a-real-effect'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown background sound', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12, undefined, 'not-a-real-sound'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('stores the chosen voice effect and background sound', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-6',
        senderId: WOMAN_ID,
        contentType: 'VOICE_NOTE',
        content: null,
        mediaUrl: 'file:///tmp/note.m4a',
        isBlurred: false,
        durationSeconds: 12,
        voiceEffectId: 'robot',
        backgroundSoundId: 'rain',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12, 'robot', 'rain');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'VOICE_NOTE',
          mediaUrl: 'file:///tmp/note.m4a',
          durationSeconds: 12,
          voiceEffectId: 'robot',
          backgroundSoundId: 'rain',
        },
      });
      expect(result.voiceEffectId).toBe('robot');
      expect(result.backgroundSoundId).toBe('rain');
    });
  });

  describe('getVoiceNoteEffectsCatalog', () => {
    it('returns the curated voice effect and background sound catalogs', () => {
      const catalog = service.getVoiceNoteEffectsCatalog();

      expect(catalog.voiceEffects.length).toBeGreaterThan(0);
      expect(catalog.backgroundSounds.length).toBeGreaterThan(0);
      expect(catalog.voiceEffects.every((effect) => effect.id && effect.label)).toBe(true);
    });
  });

  describe('revealImage', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(
        service.revealImage('someone-else', MATCH_ID, 'message-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the message does not belong to the match', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: 'other-match',
        senderId: MAN_ID,
        contentType: 'IMAGE',
        isBlurred: true,
      });

      await expect(service.revealImage(WOMAN_ID, MATCH_ID, 'message-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects the sender revealing their own photo', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        isBlurred: true,
      });

      await expect(service.revealImage(WOMAN_ID, MATCH_ID, 'message-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets the recipient reveal a blurred photo', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.message.update.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.revealImage(MAN_ID, MATCH_ID, 'message-1');

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'message-1' },
        data: { isBlurred: false },
      });
      expect(result.isBlurred).toBe(false);
    });
  });

  describe('listMessages', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(service.listMessages('someone-else', MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns messages ordered by creation time', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          isBlurred: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { matchId: MATCH_ID },
        orderBy: { createdAt: 'asc' },
      });
      expect(messages).toEqual([
        {
          id: 'm1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          isBlurred: false,
          moderationFlagged: false,
          moderationCategories: [],
          voiceEffectId: null,
          backgroundSoundId: null,
          readAt: null,
          icebreaker: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("marks the other person's unread messages as read when receipts are enabled", async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: MAN_ID,
          contentType: 'TEXT',
          content: 'hey',
          mediaUrl: null,
          isBlurred: false,
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({ readReceiptsEnabled: true });

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1'] } },
        data: { readAt: expect.any(Date) },
      });
      expect(messages[0].readAt).not.toBeNull();
    });

    it('does not stamp reads when the reader has disabled read receipts', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: MAN_ID,
          contentType: 'TEXT',
          content: 'hey',
          mediaUrl: null,
          isBlurred: false,
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({ readReceiptsEnabled: false });

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
      expect(messages[0].readAt).toBeNull();
    });

    it('does not mark the current user\'s own outgoing messages as read', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          isBlurred: false,
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('setReadReceiptsEnabled', () => {
    it('updates and returns the new setting', async () => {
      prisma.user.update.mockResolvedValue({ readReceiptsEnabled: false });

      const result = await service.setReadReceiptsEnabled(WOMAN_ID, false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        data: { readReceiptsEnabled: false },
      });
      expect(result).toEqual({ readReceiptsEnabled: false });
    });
  });

  describe('getIcebreakerPrompts', () => {
    it('returns a non-empty static list of two-option prompts', () => {
      const prompts = service.getIcebreakerPrompts();

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          question: expect.any(String),
          optionA: expect.any(String),
          optionB: expect.any(String),
        }),
      );
    });
  });

  describe('sendIcebreaker', () => {
    it('rejects an unknown prompt id', async () => {
      await expect(
        service.sendIcebreaker(WOMAN_ID, MATCH_ID, 'not-a-real-prompt'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects the man sending the first icebreaker to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendIcebreaker(MAN_ID, MATCH_ID, 'coffee-or-tea'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates an ICEBREAKER message with no responses yet', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'ICEBREAKER',
        content: 'coffee-or-tea',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendIcebreaker(WOMAN_ID, MATCH_ID, 'coffee-or-tea');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { matchId: MATCH_ID, senderId: WOMAN_ID, contentType: 'ICEBREAKER', content: 'coffee-or-tea' },
      });
      expect(result.icebreaker).toEqual({
        promptId: 'coffee-or-tea',
        question: 'Coffee or tea?',
        optionA: 'Coffee',
        optionB: 'Tea',
        myOptionIndex: null,
        otherOptionIndex: null,
      });
    });
  });

  describe('respondToIcebreaker', () => {
    it('throws when the message is not an icebreaker in this match', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        contentType: 'TEXT',
      });

      await expect(
        service.respondToIcebreaker(WOMAN_ID, MATCH_ID, 'message-1', 0),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.icebreakerResponse.upsert).not.toHaveBeenCalled();
    });

    it("upserts the responder's pick and reveals both sides once both have answered", async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'ICEBREAKER',
        content: 'coffee-or-tea',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.icebreakerResponse.findMany.mockResolvedValue([
        { userId: WOMAN_ID, optionIndex: 0 },
        { userId: MAN_ID, optionIndex: 1 },
      ]);

      const result = await service.respondToIcebreaker(MAN_ID, MATCH_ID, 'message-1', 1);

      expect(prisma.icebreakerResponse.upsert).toHaveBeenCalledWith({
        where: { messageId_userId: { messageId: 'message-1', userId: MAN_ID } },
        create: { messageId: 'message-1', userId: MAN_ID, optionIndex: 1 },
        update: { optionIndex: 1 },
      });
      expect(result.icebreaker).toEqual({
        promptId: 'coffee-or-tea',
        question: 'Coffee or tea?',
        optionA: 'Coffee',
        optionB: 'Tea',
        myOptionIndex: 1,
        otherOptionIndex: 0,
      });
    });

    it("only shows the responder's own pick until the other side answers", async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'ICEBREAKER',
        content: 'coffee-or-tea',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.icebreakerResponse.findMany.mockResolvedValue([{ userId: MAN_ID, optionIndex: 1 }]);

      const result = await service.respondToIcebreaker(MAN_ID, MATCH_ID, 'message-1', 1);

      expect(result.icebreaker?.myOptionIndex).toBe(1);
      expect(result.icebreaker?.otherOptionIndex).toBeNull();
    });
  });

  describe('listMessages icebreaker hydration', () => {
    it("includes both sides' answers when listing a conversation", async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'message-1',
          senderId: WOMAN_ID,
          contentType: 'ICEBREAKER',
          content: 'coffee-or-tea',
          mediaUrl: null,
          isBlurred: false,
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.icebreakerResponse.findMany.mockResolvedValue([
        { messageId: 'message-1', userId: WOMAN_ID, optionIndex: 0 },
        { messageId: 'message-1', userId: MAN_ID, optionIndex: 1 },
      ]);

      const messages = await service.listMessages(MAN_ID, MATCH_ID);

      expect(prisma.icebreakerResponse.findMany).toHaveBeenCalledWith({
        where: { messageId: { in: ['message-1'] } },
      });
      expect(messages[0].icebreaker).toEqual({
        promptId: 'coffee-or-tea',
        question: 'Coffee or tea?',
        optionA: 'Coffee',
        optionB: 'Tea',
        myOptionIndex: 1,
        otherOptionIndex: 0,
      });
    });
  });

  describe('listMyMatches', () => {
    it('returns active matches with the other user profile info', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(24),
          firstMessageSentAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: MAN_ID, name: 'Sam', profilePhotoUrl: 'sam.jpg' },
      ]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(matches).toEqual([
        {
          matchId: MATCH_ID,
          otherUserId: MAN_ID,
          otherUserName: 'Sam',
          otherUserPhotoUrl: 'sam.jpg',
          expiresAt: expect.any(String),
          firstMessageSent: false,
          canExtend: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          needsGhostingPrompt: false,
        },
      ]);
    });

    it('reports no expiresAt once the first message has been sent', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-1),
          firstMessageSentAt: new Date('2026-01-01T01:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(matches[0].firstMessageSent).toBe(true);
      expect(matches[0].expiresAt).toBeNull();
    });

    it('dissolves an expired unmessaged match and excludes it from the results', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-1),
          firstMessageSentAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.message.deleteMany).toHaveBeenCalledWith({ where: { matchId: MATCH_ID } });
      expect(prisma.swipe.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { swiperId: WOMAN_ID, targetUserId: MAN_ID },
            { swiperId: MAN_ID, targetUserId: WOMAN_ID },
          ],
        },
      });
      expect(prisma.match.delete).toHaveBeenCalledWith({ where: { id: MATCH_ID } });
      expect(prisma.dissolvedMatch.create).toHaveBeenCalledWith({
        data: { userAId: WOMAN_ID, userBId: MAN_ID },
      });
      expect(matches).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('flags a match for a ghosting prompt when the other side sent the last message days ago', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-100),
          firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, senderId: MAN_ID, createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
      ]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(matches[0].needsGhostingPrompt).toBe(true);
    });

    it('does not flag a match when it is the current user who owes the reply', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-100),
          firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, senderId: WOMAN_ID, createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
      ]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(matches[0].needsGhostingPrompt).toBe(false);
    });

    it('does not flag a match still within the ghosting grace period', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-100),
          firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, senderId: MAN_ID, createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      ]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(matches[0].needsGhostingPrompt).toBe(false);
    });
  });

  describe('unmatch', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(service.unmatch('someone-else', MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes the messages, swipes, and match, and records a reconnect trace', async () => {
      mockMatch({ firstMessageSentAt: new Date() });

      const result = await service.unmatch(WOMAN_ID, MATCH_ID);

      expect(prisma.message.deleteMany).toHaveBeenCalledWith({ where: { matchId: MATCH_ID } });
      expect(prisma.match.delete).toHaveBeenCalledWith({ where: { id: MATCH_ID } });
      expect(prisma.dissolvedMatch.create).toHaveBeenCalledWith({
        data: { userAId: WOMAN_ID, userBId: MAN_ID },
      });
      expect(result).toEqual({ unmatched: true });
    });
  });

  describe('listReconnectableMatches', () => {
    it('returns an empty list when there is nothing to reconnect', async () => {
      prisma.dissolvedMatch.findMany.mockResolvedValue([]);

      const result = await service.listReconnectableMatches(WOMAN_ID);

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('maps each dissolved match to the other participant', async () => {
      prisma.dissolvedMatch.findMany.mockResolvedValue([
        {
          id: 'dissolved-1',
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          dissolvedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: 'sam.jpg' }]);

      const result = await service.listReconnectableMatches(WOMAN_ID);

      expect(result).toEqual([
        {
          dissolvedMatchId: 'dissolved-1',
          otherUserId: MAN_ID,
          otherUserName: 'Sam',
          otherUserPhotoUrl: 'sam.jpg',
          dissolvedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('reconnectMatch', () => {
    it('rejects a non-premium user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: WOMAN_ID, isPremium: false });

      await expect(service.reconnectMatch(WOMAN_ID, 'dissolved-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.dissolvedMatch.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the dissolved match does not belong to the user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: WOMAN_ID, isPremium: true });
      prisma.dissolvedMatch.findUnique.mockResolvedValue({
        id: 'dissolved-1',
        userAId: MAN_ID,
        userBId: 'someone-else',
      });

      await expect(service.reconnectMatch(WOMAN_ID, 'dissolved-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when an active match already exists between the two', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: WOMAN_ID, isPremium: true });
      prisma.dissolvedMatch.findUnique.mockResolvedValue({
        id: 'dissolved-1',
        userAId: WOMAN_ID,
        userBId: MAN_ID,
      });
      prisma.match.findUnique.mockResolvedValue({ id: 'already-matched' });

      await expect(service.reconnectMatch(WOMAN_ID, 'dissolved-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a fresh match and removes the dissolved record', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: WOMAN_ID, isPremium: true });
      prisma.dissolvedMatch.findUnique.mockResolvedValue({
        id: 'dissolved-1',
        userAId: WOMAN_ID,
        userBId: MAN_ID,
      });
      prisma.match.findUnique.mockResolvedValue(null);
      const newMatch = {
        id: 'new-match',
        userAId: WOMAN_ID,
        userBId: MAN_ID,
        firstMessageExpiresAt: hoursFromNow(24),
        firstMessageSentAt: null,
        firstMessageExtendedAt: null,
      };
      prisma.match.create.mockReturnValue(newMatch);
      prisma.dissolvedMatch.delete.mockReturnValue(undefined);

      const result = await service.reconnectMatch(WOMAN_ID, 'dissolved-1');

      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: expect.any(Date),
        },
      });
      expect(prisma.dissolvedMatch.delete).toHaveBeenCalledWith({ where: { id: 'dissolved-1' } });
      expect(result.matchId).toBe('new-match');
      expect(result.isExpired).toBe(false);
    });
  });

  describe('listSharedMatches', () => {
    it('rejects when joint browsing is not enabled with this partner', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue(null);

      await expect(service.listSharedMatches(WOMAN_ID, MAN_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });

    it("returns the partner's matches when joint browsing is enabled", async () => {
      prisma.partnerLink.findFirst.mockResolvedValue({ id: 'link-1' });
      prisma.match.findMany.mockResolvedValue([]);

      const result = await service.listSharedMatches(WOMAN_ID, MAN_ID);

      expect(prisma.partnerLink.findFirst).toHaveBeenCalledWith({
        where: {
          jointBrowsingEnabled: true,
          OR: [
            { userAId: WOMAN_ID, userBId: MAN_ID },
            { userAId: MAN_ID, userBId: WOMAN_ID },
          ],
        },
      });
      expect(result).toEqual([]);
    });
  });

  describe('listSharedMessages', () => {
    it('rejects when joint browsing is not enabled with this partner', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue(null);

      await expect(service.listSharedMessages(WOMAN_ID, MAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.match.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the match does not belong to the partner', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue({ id: 'link-1' });
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: 'someone-else', userBId: 'another-one' });

      await expect(service.listSharedMessages(WOMAN_ID, MAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the message history without mutating read receipts', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue({ id: 'link-1' });
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: MAN_ID, userBId: 'someone-else' });
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: MAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          isBlurred: false,
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.listSharedMessages(WOMAN_ID, MAN_ID, MATCH_ID);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('hi');
    });
  });
});
