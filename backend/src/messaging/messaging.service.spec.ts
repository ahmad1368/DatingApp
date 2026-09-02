import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GiftingService } from '../gifting/gifting.service';
import { ContentModerator } from './interfaces/content-moderator.interface';
import { ImageModerator } from './interfaces/image-moderator.interface';
import { TranscriptionProvider } from './interfaces/transcription-provider.interface';
import { TranslationProvider } from './interfaces/translation-provider.interface';
import { MessagingService } from './messaging.service';
import { UNMATCH_REASONS } from './messaging.constants';

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
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    icebreakerResponse: { findMany: jest.Mock; upsert: jest.Mock };
    pollVote: { findMany: jest.Mock; upsert: jest.Mock };
    gameCardResponse: { findMany: jest.Mock; upsert: jest.Mock };
    readReceiptUnlock: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    swipe: { deleteMany: jest.Mock };
    dissolvedMatch: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
    archivedMessage: { findMany: jest.Mock; createMany: jest.Mock };
    matchNote: { findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
    chatWallpaperPreference: { findUnique: jest.Mock; upsert: jest.Mock };
    partnerLink: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let imageModerator: { moderate: jest.Mock };
  let contentModerator: { moderate: jest.Mock };
  let notificationsService: { notify: jest.Mock };
  let transcriptionProvider: { transcribe: jest.Mock };
  let giftingService: { sendGift: jest.Mock };
  let translationProvider: { translate: jest.Mock };

  beforeEach(() => {
    imageModerator = { moderate: jest.fn().mockResolvedValue({ flagged: false, categories: [] }) };
    contentModerator = { moderate: jest.fn().mockResolvedValue({ flagged: false, categories: [] }) };
    notificationsService = { notify: jest.fn() };
    transcriptionProvider = { transcribe: jest.fn().mockResolvedValue('a transcript') };
    giftingService = { sendGift: jest.fn().mockResolvedValue({ tokenBalance: 90, transaction: {} }) };
    translationProvider = { translate: jest.fn().mockResolvedValue('Hola!') };
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
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      icebreakerResponse: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      pollVote: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      gameCardResponse: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      readReceiptUnlock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      swipe: { deleteMany: jest.fn() },
      dissolvedMatch: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      archivedMessage: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
      matchNote: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      chatWallpaperPreference: { findUnique: jest.fn(), upsert: jest.fn() },
      partnerLink: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new MessagingService(
      prisma as unknown as PrismaService,
      imageModerator as unknown as ImageModerator,
      notificationsService as unknown as NotificationsService,
      transcriptionProvider as unknown as TranscriptionProvider,
      giftingService as unknown as GiftingService,
      contentModerator as unknown as ContentModerator,
      translationProvider as unknown as TranslationProvider,
    );
  });

  function mockMatch(overrides: Partial<{
    createdAt: Date;
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
      createdAt: hoursFromNow(-1),
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

    it("surfaces the other user's last-active timestamp when the conversation is still recent", async () => {
      const lastActiveAt = hoursFromNow(-2);
      mockMatch({ createdAt: hoursFromNow(-1) });
      prisma.user.findUnique.mockResolvedValue({ isVerified: false, lastActiveAt });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.otherUserLastActiveAt).toBe(lastActiveAt.toISOString());
    });

    it('hides the last-active timestamp once the chat has gone quiet for a week with no messages', async () => {
      mockMatch({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
      prisma.user.findUnique.mockResolvedValue({ isVerified: false, lastActiveAt: new Date() });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.otherUserLastActiveAt).toBeNull();
    });

    it('bases ghosting protection on the last message rather than the match creation date', async () => {
      mockMatch({ createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });
      prisma.user.findUnique.mockResolvedValue({ isVerified: false, lastActiveAt: new Date() });
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });

      const status = await service.getMatchStatus(MAN_ID, MATCH_ID);

      expect(status.otherUserLastActiveAt).not.toBeNull();
    });
  });

  describe('recordActivity', () => {
    it('stamps and returns the current activity timestamp', async () => {
      prisma.user.update.mockResolvedValue({});

      const result = await service.recordActivity(WOMAN_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        data: { lastActiveAt: expect.any(Date) },
      });
      expect(new Date(result.lastActiveAt).getTime()).not.toBeNaN();
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

  describe('getChatWallpaperCatalog', () => {
    it('returns the static wallpaper catalog', () => {
      const catalog = service.getChatWallpaperCatalog();

      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog[0]).toEqual({ id: expect.any(String), label: expect.any(String), type: expect.any(String) });
    });
  });

  describe('getChatWallpaper', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(service.getChatWallpaper('stranger', MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns null when no wallpaper has been set yet', async () => {
      mockMatch();
      prisma.chatWallpaperPreference.findUnique.mockResolvedValue(null);

      const result = await service.getChatWallpaper(WOMAN_ID, MATCH_ID);

      expect(result).toEqual({ wallpaperId: null });
    });

    it('returns the saved wallpaper', async () => {
      mockMatch();
      prisma.chatWallpaperPreference.findUnique.mockResolvedValue({ wallpaperId: 'sunset-gradient' });

      const result = await service.getChatWallpaper(WOMAN_ID, MATCH_ID);

      expect(result).toEqual({ wallpaperId: 'sunset-gradient' });
    });
  });

  describe('setChatWallpaper', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(
        service.setChatWallpaper('stranger', MATCH_ID, 'sunset-gradient'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an unknown wallpaper id', async () => {
      mockMatch();

      await expect(
        service.setChatWallpaper(WOMAN_ID, MATCH_ID, 'not-a-real-wallpaper'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.chatWallpaperPreference.upsert).not.toHaveBeenCalled();
    });

    it('upserts the wallpaper preference for this user and match only', async () => {
      mockMatch();
      prisma.chatWallpaperPreference.upsert.mockResolvedValue({ wallpaperId: 'sunset-gradient' });

      const result = await service.setChatWallpaper(WOMAN_ID, MATCH_ID, 'sunset-gradient');

      expect(prisma.chatWallpaperPreference.upsert).toHaveBeenCalledWith({
        where: { userId_matchId: { userId: WOMAN_ID, matchId: MATCH_ID } },
        create: { userId: WOMAN_ID, matchId: MATCH_ID, wallpaperId: 'sunset-gradient' },
        update: { wallpaperId: 'sunset-gradient' },
      });
      expect(result).toEqual({ wallpaperId: 'sunset-gradient' });
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
        createdAt: hoursFromNow(-1),
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
        createdAt: hoursFromNow(-1),
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
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          moderationFlagged: false,
          moderationCategories: [],
        },
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
        moderationRemoved: false,
        voiceEffectId: null,
        backgroundSoundId: null,
        transcript: null,
        readAt: null,
        readReceiptLocked: false,
        icebreaker: null,
        poll: null,
        reservation: null,
        gift: null,
        gameCard: null,
        locationPin: null,
        voicePreviewRequest: null,
        expiryMode: null,
        viewTimerSeconds: null,
        isEphemeralExpired: false,
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

    it('tallies the recipient as having received a message', async () => {
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

      await service.sendMessage(MAN_ID, MATCH_ID, 'hey there');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        data: { messagesReceivedCount: { increment: 1 } },
      });
    });

    it('tallies the sender as having replied when the prior message was from the other side', async () => {
      mockMatch({ firstMessageSentAt: new Date() });
      prisma.message.findMany.mockResolvedValue([
        { senderId: MAN_ID },
        { senderId: WOMAN_ID },
      ]);
      prisma.message.create.mockResolvedValue({
        id: 'message-2',
        senderId: MAN_ID,
        contentType: 'TEXT',
        content: 'hey there',
        mediaUrl: null,
        isBlurred: false,
        createdAt: new Date('2026-01-01T01:00:00.000Z'),
      });

      await service.sendMessage(MAN_ID, MATCH_ID, 'hey there');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: MAN_ID },
        data: { messagesRepliedCount: { increment: 1 } },
      });
    });

    it('does not tally a reply when the sender sent the previous message too', async () => {
      mockMatch({ firstMessageSentAt: new Date() });
      prisma.message.findMany.mockResolvedValue([
        { senderId: MAN_ID },
        { senderId: MAN_ID },
      ]);
      prisma.message.create.mockResolvedValue({
        id: 'message-3',
        senderId: MAN_ID,
        contentType: 'TEXT',
        content: 'still me',
        mediaUrl: null,
        isBlurred: false,
        createdAt: new Date('2026-01-01T02:00:00.000Z'),
      });

      await service.sendMessage(MAN_ID, MATCH_ID, 'still me');

      expect(prisma.user.update).not.toHaveBeenCalledWith({
        where: { id: MAN_ID },
        data: { messagesRepliedCount: { increment: 1 } },
      });
    });

    it('scans the text and flags the message when the content moderator flags it', async () => {
      mockMatch({ firstMessageSentAt: new Date() });
      contentModerator.moderate.mockResolvedValue({ flagged: true, categories: ['harassment'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-4',
        senderId: MAN_ID,
        contentType: 'TEXT',
        content: 'you are worthless',
        mediaUrl: null,
        isBlurred: false,
        moderationFlagged: true,
        moderationCategories: ['harassment'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMessage(MAN_ID, MATCH_ID, 'you are worthless');

      expect(contentModerator.moderate).toHaveBeenCalledWith('you are worthless');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: MAN_ID,
          contentType: 'TEXT',
          content: 'you are worthless',
          moderationFlagged: true,
          moderationCategories: ['harassment'],
        },
      });
      expect(result.moderationFlagged).toBe(true);
      expect(result.moderationCategories).toEqual(['harassment']);
    });

    it('does not block sending when the text moderator fails', async () => {
      mockMatch({ firstMessageSentAt: new Date() });
      contentModerator.moderate.mockRejectedValue(new Error('service unavailable'));
      prisma.message.create.mockResolvedValue({
        id: 'message-5',
        senderId: MAN_ID,
        contentType: 'TEXT',
        content: 'hi',
        mediaUrl: null,
        isBlurred: false,
        moderationFlagged: false,
        moderationCategories: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMessage(MAN_ID, MATCH_ID, 'hi');

      expect(result.moderationFlagged).toBe(false);
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
          expiryMode: null,
          viewTimerSeconds: null,
          durationSeconds: null,
        },
      });
      expect(result.isBlurred).toBe(true);
      expect(imageModerator.moderate).toHaveBeenCalledWith('https://example.com/photo.jpg');
    });

    it('does not blur when the recipient has opted out of auto-blur', async () => {
      mockMatch();
      prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === WOMAN_ID) {
          return Promise.resolve({ genderIdentities: ['Woman'] });
        }
        return Promise.resolve({ genderIdentities: ['Man'], autoBlurIncomingMedia: false });
      });
      prisma.message.create.mockResolvedValue({
        id: 'message-5',
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: false,
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
          isBlurred: false,
          moderationFlagged: false,
          moderationCategories: [],
          expiryMode: null,
          viewTimerSeconds: null,
          durationSeconds: null,
        },
      });
      expect(result.isBlurred).toBe(false);
    });

    it('blurs an image the moderator flags as explicit even when the recipient opted out of auto-blur', async () => {
      mockMatch();
      prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === WOMAN_ID) {
          return Promise.resolve({ genderIdentities: ['Woman'] });
        }
        return Promise.resolve({ genderIdentities: ['Man'], autoBlurIncomingMedia: false });
      });
      imageModerator.moderate.mockResolvedValue({ flagged: true, categories: ['sexual'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-6',
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
          expiryMode: null,
          viewTimerSeconds: null,
          durationSeconds: null,
        },
      });
      expect(result.isBlurred).toBe(true);
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
          expiryMode: null,
          viewTimerSeconds: null,
          durationSeconds: null,
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
          expiryMode: null,
          viewTimerSeconds: null,
          durationSeconds: null,
        },
      });
      expect(result.isBlurred).toBe(false);
      expect(imageModerator.moderate).not.toHaveBeenCalled();
    });

    it('rejects TIMER without a viewTimerSeconds', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendMediaMessage(WOMAN_ID, MATCH_ID, 'IMAGE', 'https://example.com/photo.jpg', 'TIMER'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects a viewTimerSeconds without TIMER', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendMediaMessage(
          WOMAN_ID,
          MATCH_ID,
          'IMAGE',
          'https://example.com/photo.jpg',
          undefined,
          5,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('persists expiryMode and viewTimerSeconds for an auto-expiring TIMER photo', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-6',
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: true,
        expiryMode: 'TIMER',
        viewTimerSeconds: 5,
        viewedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMediaMessage(
        WOMAN_ID,
        MATCH_ID,
        'IMAGE',
        'https://example.com/photo.jpg',
        'TIMER',
        5,
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
          expiryMode: 'TIMER',
          viewTimerSeconds: 5,
          durationSeconds: null,
        },
      });
      // Not yet viewed, so the mediaUrl is hidden even from this send response.
      expect(result.mediaUrl).toBeNull();
      expect(result.expiryMode).toBe('TIMER');
      expect(result.viewTimerSeconds).toBe(5);
      expect(result.isEphemeralExpired).toBe(false);
    });

    it('rejects a VIDEO_REACTION without a durationSeconds', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendMediaMessage(WOMAN_ID, MATCH_ID, 'VIDEO_REACTION', 'https://example.com/clip.mp4'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects a durationSeconds without VIDEO_REACTION', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendMediaMessage(
          WOMAN_ID,
          MATCH_ID,
          'IMAGE',
          'https://example.com/photo.jpg',
          undefined,
          undefined,
          5,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('sends a video reaction unblurred and unmoderated', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-7',
        senderId: WOMAN_ID,
        contentType: 'VIDEO_REACTION',
        content: null,
        mediaUrl: 'https://example.com/clip.mp4',
        isBlurred: false,
        durationSeconds: 5,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMediaMessage(
        WOMAN_ID,
        MATCH_ID,
        'VIDEO_REACTION',
        'https://example.com/clip.mp4',
        undefined,
        undefined,
        5,
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'VIDEO_REACTION',
          mediaUrl: 'https://example.com/clip.mp4',
          isBlurred: false,
          moderationFlagged: false,
          moderationCategories: [],
          expiryMode: null,
          viewTimerSeconds: null,
          durationSeconds: 5,
        },
      });
      expect(result.isBlurred).toBe(false);
      expect(imageModerator.moderate).not.toHaveBeenCalled();
      expect(result.durationSeconds).toBe(5);
    });
  });

  describe('viewEphemeralMedia', () => {
    it('throws when the message does not belong to this match', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', matchId: 'other-match' });

      await expect(service.viewEphemeralMedia(MAN_ID, MATCH_ID, 'm1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when the sender tries to view their own attachment', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        expiryMode: 'VIEW_ONCE',
        viewTimerSeconds: null,
        viewedAt: null,
      });

      await expect(service.viewEphemeralMedia(WOMAN_ID, MATCH_ID, 'm1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws when the message is not an expiring attachment', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        expiryMode: null,
      });

      await expect(service.viewEphemeralMedia(MAN_ID, MATCH_ID, 'm1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when a VIEW_ONCE attachment has already been viewed', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        expiryMode: 'VIEW_ONCE',
        viewTimerSeconds: null,
        viewedAt: new Date(),
      });

      await expect(service.viewEphemeralMedia(MAN_ID, MATCH_ID, 'm1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('throws when a TIMER attachment already expired', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        expiryMode: 'TIMER',
        viewTimerSeconds: 5,
        viewedAt: new Date(Date.now() - 60_000),
      });

      await expect(service.viewEphemeralMedia(MAN_ID, MATCH_ID, 'm1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reveals the media and stamps viewedAt on first view', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: false,
        expiryMode: 'VIEW_ONCE',
        viewTimerSeconds: null,
        viewedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.message.update.mockResolvedValue({
        id: 'm1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: false,
        expiryMode: 'VIEW_ONCE',
        viewTimerSeconds: null,
        viewedAt: new Date(),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.viewEphemeralMedia(MAN_ID, MATCH_ID, 'm1');

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { viewedAt: expect.any(Date) },
      });
      // The one and only response that ever shows this VIEW_ONCE photo's URL.
      expect(result.mediaUrl).toBe('https://example.com/photo.jpg');
      expect(result.isEphemeralExpired).toBe(true);
    });

    it('does not re-stamp viewedAt on a repeat view within a TIMER window', async () => {
      mockMatch();
      const viewedAt = new Date(Date.now() - 1000);
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'IMAGE',
        content: null,
        mediaUrl: 'https://example.com/photo.jpg',
        isBlurred: false,
        expiryMode: 'TIMER',
        viewTimerSeconds: 30,
        viewedAt,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.viewEphemeralMedia(MAN_ID, MATCH_ID, 'm1');

      expect(prisma.message.update).not.toHaveBeenCalled();
      expect(result.mediaUrl).toBe('https://example.com/photo.jpg');
      expect(result.isEphemeralExpired).toBe(false);
    });
  });

  describe('getMediaBlurPreference', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMediaBlurPreference(WOMAN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the stored preference', async () => {
      prisma.user.findUnique.mockResolvedValue({ autoBlurIncomingMedia: false });

      const result = await service.getMediaBlurPreference(WOMAN_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        select: { autoBlurIncomingMedia: true },
      });
      expect(result).toEqual({ autoBlurIncomingMedia: false });
    });
  });

  describe('setMediaBlurPreference', () => {
    it('persists the preference', async () => {
      prisma.user.update.mockResolvedValue({ autoBlurIncomingMedia: false });

      const result = await service.setMediaBlurPreference(WOMAN_ID, false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        data: { autoBlurIncomingMedia: false },
      });
      expect(result).toEqual({ autoBlurIncomingMedia: false });
    });
  });

  describe('getPreferredLanguage', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getPreferredLanguage(WOMAN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the stored preference', async () => {
      prisma.user.findUnique.mockResolvedValue({ preferredLanguage: 'Spanish' });

      const result = await service.getPreferredLanguage(WOMAN_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        select: { preferredLanguage: true },
      });
      expect(result).toEqual({ preferredLanguage: 'Spanish' });
    });
  });

  describe('setPreferredLanguage', () => {
    it('persists the preference', async () => {
      prisma.user.update.mockResolvedValue({ preferredLanguage: 'French' });

      const result = await service.setPreferredLanguage(WOMAN_ID, 'French');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        data: { preferredLanguage: 'French' },
      });
      expect(result).toEqual({ preferredLanguage: 'French' });
    });
  });

  describe('translateMessage', () => {
    function mockTextMessage(overrides: Partial<{ contentType: string; content: string | null }> = {}) {
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: MAN_ID,
        contentType: 'TEXT',
        content: 'Hello there!',
        ...overrides,
      });
    }

    it('throws when the message does not exist or belongs to a different match', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({ id: 'message-1', matchId: 'other-match' });

      await expect(
        service.translateMessage(WOMAN_ID, MATCH_ID, 'message-1', 'Spanish'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(translationProvider.translate).not.toHaveBeenCalled();
    });

    it('rejects a non-TEXT message', async () => {
      mockMatch();
      mockTextMessage({ contentType: 'IMAGE', content: null });

      await expect(
        service.translateMessage(WOMAN_ID, MATCH_ID, 'message-1', 'Spanish'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(translationProvider.translate).not.toHaveBeenCalled();
    });

    it('translates using the given targetLanguage without looking up a preference', async () => {
      mockMatch();
      mockTextMessage();

      const result = await service.translateMessage(WOMAN_ID, MATCH_ID, 'message-1', 'Spanish');

      expect(translationProvider.translate).toHaveBeenCalledWith('Hello there!', 'Spanish');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ translatedContent: 'Hola!' });
    });

    it('falls back to the caller preferredLanguage when targetLanguage is omitted', async () => {
      mockMatch();
      mockTextMessage();
      prisma.user.findUnique.mockResolvedValue({ preferredLanguage: 'German' });

      await service.translateMessage(WOMAN_ID, MATCH_ID, 'message-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        select: { preferredLanguage: true },
      });
      expect(translationProvider.translate).toHaveBeenCalledWith('Hello there!', 'German');
    });

    it('rejects when neither targetLanguage nor a preferred language is available', async () => {
      mockMatch();
      mockTextMessage();
      prisma.user.findUnique.mockResolvedValue({ preferredLanguage: null });

      await expect(service.translateMessage(WOMAN_ID, MATCH_ID, 'message-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(translationProvider.translate).not.toHaveBeenCalled();
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
          transcript: 'a transcript',
          moderationFlagged: false,
          moderationCategories: [],
        },
      });
      expect(result.contentType).toBe('VOICE_NOTE');
      expect(result.durationSeconds).toBe(12);
      expect(result.mediaUrl).toBe('file:///tmp/note.m4a');
      expect(result.voiceEffectId).toBeNull();
      expect(result.backgroundSoundId).toBeNull();
    });

    it('transcribes the recording and stores the caption', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      transcriptionProvider.transcribe.mockResolvedValue('running a bit late!');
      prisma.message.create.mockResolvedValue({
        id: 'message-5',
        senderId: WOMAN_ID,
        contentType: 'VOICE_NOTE',
        content: null,
        mediaUrl: 'file:///tmp/note.m4a',
        isBlurred: false,
        durationSeconds: 12,
        transcript: 'running a bit late!',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12);

      expect(transcriptionProvider.transcribe).toHaveBeenCalledWith('file:///tmp/note.m4a');
      expect(result.transcript).toBe('running a bit late!');
    });

    it('leaves the transcript null when transcription fails', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      transcriptionProvider.transcribe.mockRejectedValue(new Error('service unavailable'));
      prisma.message.create.mockResolvedValue({
        id: 'message-5',
        senderId: WOMAN_ID,
        contentType: 'VOICE_NOTE',
        content: null,
        mediaUrl: 'file:///tmp/note.m4a',
        isBlurred: false,
        durationSeconds: 12,
        transcript: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ transcript: null, moderationFlagged: false, moderationCategories: [] }),
      });
      expect(contentModerator.moderate).not.toHaveBeenCalled();
      expect(result.transcript).toBeNull();
    });

    it('flags a voice note whose transcript the AI moderator considers harassment', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      transcriptionProvider.transcribe.mockResolvedValue('you are worthless and pathetic');
      contentModerator.moderate.mockResolvedValue({ flagged: true, categories: ['harassment'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-5',
        senderId: WOMAN_ID,
        contentType: 'VOICE_NOTE',
        content: null,
        mediaUrl: 'file:///tmp/note.m4a',
        isBlurred: false,
        durationSeconds: 12,
        transcript: 'you are worthless and pathetic',
        moderationFlagged: true,
        moderationCategories: ['harassment'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendVoiceNote(WOMAN_ID, MATCH_ID, 'file:///tmp/note.m4a', 12);

      expect(contentModerator.moderate).toHaveBeenCalledWith('you are worthless and pathetic');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ moderationFlagged: true, moderationCategories: ['harassment'] }),
      });
      expect(result.moderationFlagged).toBe(true);
      expect(result.moderationCategories).toEqual(['harassment']);
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
        transcript: 'a transcript',
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
          transcript: 'a transcript',
          moderationFlagged: false,
          moderationCategories: [],
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
          moderationRemoved: false,
          voiceEffectId: null,
          backgroundSoundId: null,
          transcript: null,
          readAt: null,
          readReceiptLocked: false,
          icebreaker: null,
          poll: null,
          reservation: null,
          gift: null,
          gameCard: null,
          locationPin: null,
          voicePreviewRequest: null,
          expiryMode: null,
          viewTimerSeconds: null,
          isEphemeralExpired: false,
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

  describe('unlockReadReceipt', () => {
    function mockSentReadMessage(overrides: Partial<{ readAt: Date | null }> = {}) {
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'TEXT',
        content: 'hi',
        mediaUrl: null,
        isBlurred: false,
        readAt: new Date('2026-01-01T00:05:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
      });
    }

    it('throws when the message does not exist or was not sent by the caller', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: MAN_ID,
        readAt: new Date(),
      });

      await expect(service.unlockReadReceipt(WOMAN_ID, MATCH_ID, 'message-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.readReceiptUnlock.create).not.toHaveBeenCalled();
    });

    it('rejects unlocking a message that has not been read yet', async () => {
      mockMatch();
      mockSentReadMessage({ readAt: null });

      await expect(service.unlockReadReceipt(WOMAN_ID, MATCH_ID, 'message-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.readReceiptUnlock.create).not.toHaveBeenCalled();
    });

    it('rejects a free-tier user without enough tokens', async () => {
      mockMatch();
      mockSentReadMessage();
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'FREE',
        giftTokenBalance: 5,
      });

      await expect(service.unlockReadReceipt(WOMAN_ID, MATCH_ID, 'message-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.readReceiptUnlock.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('spends tokens for a free-tier user with enough balance and reveals the read time', async () => {
      mockMatch();
      mockSentReadMessage();
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'FREE',
        giftTokenBalance: 50,
      });

      const result = await service.unlockReadReceipt(WOMAN_ID, MATCH_ID, 'message-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: WOMAN_ID },
        data: { giftTokenBalance: { decrement: 10 } },
      });
      expect(prisma.readReceiptUnlock.create).toHaveBeenCalledWith({
        data: { messageId: 'message-1', userId: WOMAN_ID },
      });
      expect(result.readAt).not.toBeNull();
      expect(result.readReceiptLocked).toBe(false);
    });

    it('unlocks for free on a paid subscription tier without spending tokens', async () => {
      mockMatch();
      mockSentReadMessage();
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'GOLD',
        giftTokenBalance: 0,
      });

      const result = await service.unlockReadReceipt(WOMAN_ID, MATCH_ID, 'message-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.readReceiptUnlock.create).toHaveBeenCalledWith({
        data: { messageId: 'message-1', userId: WOMAN_ID },
      });
      expect(result.readAt).not.toBeNull();
    });

    it('does not charge again once already unlocked', async () => {
      mockMatch();
      mockSentReadMessage();
      prisma.readReceiptUnlock.findUnique.mockResolvedValue({
        id: 'unlock-1',
        messageId: 'message-1',
        userId: WOMAN_ID,
      });
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'FREE',
        giftTokenBalance: 0,
      });

      const result = await service.unlockReadReceipt(WOMAN_ID, MATCH_ID, 'message-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.readReceiptUnlock.create).not.toHaveBeenCalled();
      expect(result.readAt).not.toBeNull();
    });
  });

  describe('listMessages read receipt masking', () => {
    it('withholds readAt on a sent message that is read but not unlocked, for a free-tier viewer', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          isBlurred: false,
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'FREE' });

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(messages[0].readAt).toBeNull();
      expect(messages[0].readReceiptLocked).toBe(true);
    });

    it('reveals readAt once the sent message has an unlock record', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          isBlurred: false,
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'FREE' });
      prisma.readReceiptUnlock.findMany.mockResolvedValue([{ messageId: 'm1', userId: WOMAN_ID }]);

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(messages[0].readAt).not.toBeNull();
      expect(messages[0].readReceiptLocked).toBe(false);
    });

    it('reveals readAt for free on a paid subscription tier', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          isBlurred: false,
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'PLUS' });

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(messages[0].readAt).not.toBeNull();
      expect(messages[0].readReceiptLocked).toBe(false);
    });

    it('never masks readAt on messages received from the other person', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: MAN_ID,
          contentType: 'TEXT',
          content: 'hey',
          mediaUrl: null,
          isBlurred: false,
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(messages[0].readAt).not.toBeNull();
      expect(messages[0].readReceiptLocked).toBe(false);
      expect(prisma.readReceiptUnlock.findMany).not.toHaveBeenCalled();
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

  describe('getUnmatchReasons', () => {
    it('returns the static quick-pick reason list', () => {
      expect(service.getUnmatchReasons()).toEqual(UNMATCH_REASONS);
    });
  });

  describe('getSuggestedIcebreaker', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(
        service.getSuggestedIcebreaker('someone-else', MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns null once the first-message window has expired', async () => {
      mockMatch({ firstMessageExpiresAt: hoursFromNow(-1) });

      const result = await service.getSuggestedIcebreaker(WOMAN_ID, MATCH_ID);

      expect(result).toBeNull();
    });

    it('returns null once an icebreaker has already been sent in this match', async () => {
      mockMatch();
      prisma.message.findFirst.mockResolvedValue({ id: 'message-1', contentType: 'ICEBREAKER' });

      const result = await service.getSuggestedIcebreaker(WOMAN_ID, MATCH_ID);

      expect(result).toBeNull();
      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: { matchId: MATCH_ID, contentType: 'ICEBREAKER' },
      });
    });

    it('returns a curated prompt when the match is fresh and unplayed', async () => {
      mockMatch();
      prisma.message.findFirst.mockResolvedValue(null);

      const result = await service.getSuggestedIcebreaker(WOMAN_ID, MATCH_ID);

      expect(result).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          question: expect.any(String),
          optionA: expect.any(String),
          optionB: expect.any(String),
        }),
      );
    });

    it('deterministically picks the same prompt for the same match', async () => {
      mockMatch();
      prisma.message.findFirst.mockResolvedValue(null);

      const first = await service.getSuggestedIcebreaker(WOMAN_ID, MATCH_ID);
      const second = await service.getSuggestedIcebreaker(WOMAN_ID, MATCH_ID);

      expect(first?.id).toBe(second?.id);
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

  describe('sendPoll', () => {
    it('rejects fewer than the minimum number of options', async () => {
      await expect(
        service.sendPoll(WOMAN_ID, MATCH_ID, 'Where should we go?', ['Coffee shop']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects more than the maximum number of options', async () => {
      await expect(
        service.sendPoll(WOMAN_ID, MATCH_ID, 'Where should we go?', ['A', 'B', 'C', 'D', 'E', 'F', 'G']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects the man sending the first poll to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendPoll(MAN_ID, MATCH_ID, 'Where should we go?', ['Coffee', 'Dinner']),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a POLL message with no votes yet', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'POLL',
        content: 'Where should we go?',
        pollOptions: ['Coffee', 'Dinner'],
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendPoll(WOMAN_ID, MATCH_ID, 'Where should we go?', ['Coffee', 'Dinner']);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'POLL',
          content: 'Where should we go?',
          pollOptions: ['Coffee', 'Dinner'],
        },
      });
      expect(result.poll).toEqual({
        question: 'Where should we go?',
        options: ['Coffee', 'Dinner'],
        myOptionIndex: null,
        voteCounts: [0, 0],
        totalVotes: 0,
      });
    });
  });

  describe('sendReservation', () => {
    it('rejects an unknown provider', async () => {
      await expect(
        service.sendReservation(WOMAN_ID, MATCH_ID, 'RESY', "Luigi's"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects the man sending the first reservation to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendReservation(MAN_ID, MATCH_ID, 'OPENTABLE', "Luigi's"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a RESERVATION message with an OpenTable search link', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'RESERVATION',
        content: "Luigi's",
        reservationProvider: 'OPENTABLE',
        reservationUrl: "https://www.opentable.com/s?term=Luigi's",
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendReservation(WOMAN_ID, MATCH_ID, 'OPENTABLE', "Luigi's");

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'RESERVATION',
          content: "Luigi's",
          reservationProvider: 'OPENTABLE',
          reservationUrl: "https://www.opentable.com/s?term=Luigi's",
        },
      });
      expect(result.reservation).toEqual({
        provider: 'OPENTABLE',
        query: "Luigi's",
        url: "https://www.opentable.com/s?term=Luigi's",
      });
    });

    it('creates a RESERVATION message with an Eventbrite search link', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-2',
        senderId: WOMAN_ID,
        contentType: 'RESERVATION',
        content: 'Jazz Night',
        reservationProvider: 'EVENTBRITE',
        reservationUrl: 'https://www.eventbrite.com/d/search?q=Jazz%20Night',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendReservation(WOMAN_ID, MATCH_ID, 'EVENTBRITE', 'Jazz Night');

      expect(result.reservation).toEqual({
        provider: 'EVENTBRITE',
        query: 'Jazz Night',
        url: 'https://www.eventbrite.com/d/search?q=Jazz%20Night',
      });
    });
  });

  describe('sendLocationPin', () => {
    it('rejects the man sending the first location pin to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(
        service.sendLocationPin(MAN_ID, MATCH_ID, 'Blue Bottle Coffee', 37.7749, -122.4194),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('creates a LOCATION_PIN message with coordinates and an optional address', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'LOCATION_PIN',
        content: 'Blue Bottle Coffee',
        locationLatitude: 37.7749,
        locationLongitude: -122.4194,
        locationAddress: '66 Mint St, San Francisco',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendLocationPin(
        WOMAN_ID,
        MATCH_ID,
        'Blue Bottle Coffee',
        37.7749,
        -122.4194,
        '66 Mint St, San Francisco',
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'LOCATION_PIN',
          content: 'Blue Bottle Coffee',
          locationLatitude: 37.7749,
          locationLongitude: -122.4194,
          locationAddress: '66 Mint St, San Francisco',
        },
      });
      expect(result.locationPin).toEqual({
        label: 'Blue Bottle Coffee',
        latitude: 37.7749,
        longitude: -122.4194,
        address: '66 Mint St, San Francisco',
      });
    });

    it('creates a LOCATION_PIN message with no address', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-2',
        senderId: WOMAN_ID,
        contentType: 'LOCATION_PIN',
        content: 'Dolores Park',
        locationLatitude: 37.7596,
        locationLongitude: -122.4269,
        locationAddress: null,
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendLocationPin(WOMAN_ID, MATCH_ID, 'Dolores Park', 37.7596, -122.4269);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'LOCATION_PIN',
          content: 'Dolores Park',
          locationLatitude: 37.7596,
          locationLongitude: -122.4269,
          locationAddress: null,
        },
      });
      expect(result.locationPin?.address).toBeNull();
    });
  });

  describe('sendVoicePreviewRequest', () => {
    it('rejects the man sending the first voice preview request to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(service.sendVoicePreviewRequest(MAN_ID, MATCH_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING VOICE_PREVIEW_REQUEST message', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'VOICE_PREVIEW_REQUEST',
        content: null,
        voicePreviewStatus: 'PENDING',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendVoicePreviewRequest(WOMAN_ID, MATCH_ID);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'VOICE_PREVIEW_REQUEST',
          voicePreviewStatus: 'PENDING',
        },
      });
      expect(result.voicePreviewRequest).toEqual({ status: 'PENDING', durationSeconds: 60 });
    });
  });

  describe('respondToVoicePreviewRequest', () => {
    it('throws when the message is not a voice preview request in this match', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({ id: 'message-1', matchId: MATCH_ID, contentType: 'TEXT' });

      await expect(
        service.respondToVoicePreviewRequest(MAN_ID, MATCH_ID, 'message-1', true),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects the sender responding to their own request', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'VOICE_PREVIEW_REQUEST',
        voicePreviewStatus: 'PENDING',
      });

      await expect(
        service.respondToVoicePreviewRequest(WOMAN_ID, MATCH_ID, 'message-1', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects responding to a request that already has a response', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'VOICE_PREVIEW_REQUEST',
        voicePreviewStatus: 'ACCEPTED',
      });

      await expect(
        service.respondToVoicePreviewRequest(MAN_ID, MATCH_ID, 'message-1', false),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('accepts a pending request', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'VOICE_PREVIEW_REQUEST',
        voicePreviewStatus: 'PENDING',
      });
      prisma.message.update.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'VOICE_PREVIEW_REQUEST',
        content: null,
        voicePreviewStatus: 'ACCEPTED',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.respondToVoicePreviewRequest(MAN_ID, MATCH_ID, 'message-1', true);

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'message-1' },
        data: { voicePreviewStatus: 'ACCEPTED' },
      });
      expect(result.voicePreviewRequest).toEqual({ status: 'ACCEPTED', durationSeconds: 60 });
    });

    it('declines a pending request', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'VOICE_PREVIEW_REQUEST',
        voicePreviewStatus: 'PENDING',
      });
      prisma.message.update.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'VOICE_PREVIEW_REQUEST',
        content: null,
        voicePreviewStatus: 'DECLINED',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.respondToVoicePreviewRequest(MAN_ID, MATCH_ID, 'message-1', false);

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'message-1' },
        data: { voicePreviewStatus: 'DECLINED' },
      });
      expect(result.voicePreviewRequest).toEqual({ status: 'DECLINED', durationSeconds: 60 });
    });
  });

  describe('sendGiftMessage', () => {
    it('rejects an unknown gift', async () => {
      await expect(service.sendGiftMessage(WOMAN_ID, MATCH_ID, 'not-a-real-gift')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(giftingService.sendGift).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects the man sending the first gift to a woman match', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });

      await expect(service.sendGiftMessage(MAN_ID, MATCH_ID, 'rose')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(giftingService.sendGift).not.toHaveBeenCalled();
    });

    it('spends the gift via GiftingService and creates a GIFT message', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'GIFT',
        content: 'rose',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendGiftMessage(WOMAN_ID, MATCH_ID, 'rose', 'For you!');

      expect(giftingService.sendGift).toHaveBeenCalledWith(WOMAN_ID, MAN_ID, 'rose', 'For you!');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { matchId: MATCH_ID, senderId: WOMAN_ID, contentType: 'GIFT', content: 'rose' },
      });
      expect(result.gift).toEqual({ giftId: 'rose', name: 'Rose', emoji: '🌹', tokenCost: 10 });
    });

    it('propagates an insufficient-balance error from GiftingService without creating a message', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      giftingService.sendGift.mockRejectedValue(new BadRequestException('Not enough gift tokens for this gift.'));

      await expect(service.sendGiftMessage(WOMAN_ID, MATCH_ID, 'rose')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('respondToPoll', () => {
    it('throws when the message is not a poll in this match', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({ id: 'message-1', matchId: MATCH_ID, contentType: 'TEXT' });

      await expect(service.respondToPoll(WOMAN_ID, MATCH_ID, 'message-1', 0)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.pollVote.upsert).not.toHaveBeenCalled();
    });

    it('rejects an option index outside the poll', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        contentType: 'POLL',
        content: 'Where should we go?',
        pollOptions: ['Coffee', 'Dinner'],
      });

      await expect(service.respondToPoll(WOMAN_ID, MATCH_ID, 'message-1', 2)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.pollVote.upsert).not.toHaveBeenCalled();
    });

    it('upserts the vote and returns the tally from the voter perspective', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        contentType: 'POLL',
        content: 'Where should we go?',
        pollOptions: ['Coffee', 'Dinner'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.pollVote.findMany.mockResolvedValue([
        { userId: WOMAN_ID, optionIndex: 0 },
        { userId: MAN_ID, optionIndex: 1 },
      ]);

      const result = await service.respondToPoll(MAN_ID, MATCH_ID, 'message-1', 1);

      expect(prisma.pollVote.upsert).toHaveBeenCalledWith({
        where: { messageId_userId: { messageId: 'message-1', userId: MAN_ID } },
        create: { messageId: 'message-1', userId: MAN_ID, optionIndex: 1 },
        update: { optionIndex: 1 },
      });
      expect(result.poll).toEqual({
        question: 'Where should we go?',
        options: ['Coffee', 'Dinner'],
        myOptionIndex: 1,
        voteCounts: [1, 1],
        totalVotes: 2,
      });
    });
  });

  describe('getGameCardPrompts', () => {
    it('returns the trivia catalog', () => {
      const prompts = service.getGameCardPrompts('TRIVIA');
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('returns the 21 Questions catalog', () => {
      const prompts = service.getGameCardPrompts('TWENTY_ONE_QUESTIONS');
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('rejects an unknown game type', () => {
      expect(() => service.getGameCardPrompts('NOT_A_GAME')).toThrow(BadRequestException);
    });
  });

  describe('sendGameCard', () => {
    it('rejects an unknown game type', async () => {
      await expect(
        service.sendGameCard(WOMAN_ID, MATCH_ID, 'NOT_A_GAME', undefined, undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown trivia question id', async () => {
      await expect(
        service.sendGameCard(WOMAN_ID, MATCH_ID, 'TRIVIA', 'not-a-real-question', undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('creates a TRIVIA game card with options and the correct answer stored', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'GAME_CARD',
        gameType: 'TRIVIA',
        content: 'coffee-or-tea-not-real',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.sendGameCard(WOMAN_ID, MATCH_ID, 'TRIVIA', 'eiffel-tower-city', undefined, undefined);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'GAME_CARD',
          content: 'eiffel-tower-city',
          pollOptions: ['Rome', 'London', 'Paris', 'Berlin'],
          gameType: 'TRIVIA',
          gameCorrectIndex: 2,
        },
      });
    });

    it('rejects Two Truths and a Lie without exactly 3 statements', async () => {
      await expect(
        service.sendGameCard(WOMAN_ID, MATCH_ID, 'TWO_TRUTHS_AND_A_LIE', undefined, ['Only one'], 0),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range lie index', async () => {
      await expect(
        service.sendGameCard(
          WOMAN_ID,
          MATCH_ID,
          'TWO_TRUTHS_AND_A_LIE',
          undefined,
          ['I have a twin', 'I hate coffee', 'I once met a president'],
          3,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('creates a TWO_TRUTHS_AND_A_LIE card storing the statements and lie index', async () => {
      mockMatch();
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      const statements = ['I have a twin', 'I hate coffee', 'I once met a president'];
      prisma.message.create.mockResolvedValue({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'GAME_CARD',
        gameType: 'TWO_TRUTHS_AND_A_LIE',
        content: null,
        pollOptions: statements,
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.sendGameCard(WOMAN_ID, MATCH_ID, 'TWO_TRUTHS_AND_A_LIE', undefined, statements, 1);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          matchId: MATCH_ID,
          senderId: WOMAN_ID,
          contentType: 'GAME_CARD',
          content: null,
          pollOptions: statements,
          gameType: 'TWO_TRUTHS_AND_A_LIE',
          gameCorrectIndex: 1,
        },
      });
    });
  });

  describe('respondToGameCard', () => {
    it('throws when the message is not a game card in this match', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({ id: 'message-1', matchId: MATCH_ID, contentType: 'TEXT' });

      await expect(service.respondToGameCard(WOMAN_ID, MATCH_ID, 'message-1', 0)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.gameCardResponse.upsert).not.toHaveBeenCalled();
    });

    it('rejects responding to a TWENTY_ONE_QUESTIONS card', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        contentType: 'GAME_CARD',
        gameType: 'TWENTY_ONE_QUESTIONS',
        content: 'q-love-language',
        pollOptions: [],
      });

      await expect(service.respondToGameCard(WOMAN_ID, MATCH_ID, 'message-1', 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.gameCardResponse.upsert).not.toHaveBeenCalled();
    });

    it('rejects an answer index outside the options', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        contentType: 'GAME_CARD',
        gameType: 'TRIVIA',
        content: 'eiffel-tower-city',
        pollOptions: ['Rome', 'London', 'Paris', 'Berlin'],
        gameCorrectIndex: 2,
      });

      await expect(service.respondToGameCard(WOMAN_ID, MATCH_ID, 'message-1', 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.gameCardResponse.upsert).not.toHaveBeenCalled();
    });

    it('reveals the correct answer once the responder answers a trivia card', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'GAME_CARD',
        gameType: 'TRIVIA',
        content: 'eiffel-tower-city',
        pollOptions: ['Rome', 'London', 'Paris', 'Berlin'],
        gameCorrectIndex: 2,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.gameCardResponse.findMany.mockResolvedValue([{ userId: MAN_ID, answerIndex: 2 }]);

      const result = await service.respondToGameCard(MAN_ID, MATCH_ID, 'message-1', 2);

      expect(prisma.gameCardResponse.upsert).toHaveBeenCalledWith({
        where: { messageId_userId: { messageId: 'message-1', userId: MAN_ID } },
        create: { messageId: 'message-1', userId: MAN_ID, answerIndex: 2 },
        update: { answerIndex: 2 },
      });
      expect(result.gameCard).toEqual({
        gameType: 'TRIVIA',
        question: 'Which city is the Eiffel Tower in?',
        options: ['Rome', 'London', 'Paris', 'Berlin'],
        myAnswerIndex: 2,
        otherAnswerIndex: null,
        correctOptionIndex: 2,
        isMyAnswerCorrect: true,
      });
    });

    it('reveals the lie once the guesser answers a Two Truths and a Lie card, even if they guessed wrong', async () => {
      mockMatch();
      prisma.message.findUnique.mockResolvedValue({
        id: 'message-1',
        matchId: MATCH_ID,
        senderId: WOMAN_ID,
        contentType: 'GAME_CARD',
        gameType: 'TWO_TRUTHS_AND_A_LIE',
        content: null,
        pollOptions: ['I have a twin', 'I hate coffee', 'I once met a president'],
        gameCorrectIndex: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.gameCardResponse.findMany.mockResolvedValue([{ userId: MAN_ID, answerIndex: 0 }]);

      const result = await service.respondToGameCard(MAN_ID, MATCH_ID, 'message-1', 0);

      expect(result.gameCard?.myAnswerIndex).toBe(0);
      expect(result.gameCard?.correctOptionIndex).toBe(1);
      expect(result.gameCard?.isMyAnswerCorrect).toBe(false);
    });
  });

  describe('listMessages game card hydration', () => {
    it('withholds the lie index from a guesser who has not answered yet', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'message-1',
          senderId: WOMAN_ID,
          contentType: 'GAME_CARD',
          gameType: 'TWO_TRUTHS_AND_A_LIE',
          content: null,
          pollOptions: ['I have a twin', 'I hate coffee', 'I once met a president'],
          gameCorrectIndex: 1,
          mediaUrl: null,
          isBlurred: false,
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.gameCardResponse.findMany.mockResolvedValue([]);

      const messages = await service.listMessages(MAN_ID, MATCH_ID);

      expect(messages[0].gameCard?.correctOptionIndex).toBeNull();
      expect(messages[0].gameCard?.isMyAnswerCorrect).toBeNull();
    });

    it('shows the sender the lie index even before the guesser answers', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'message-1',
          senderId: WOMAN_ID,
          contentType: 'GAME_CARD',
          gameType: 'TWO_TRUTHS_AND_A_LIE',
          content: null,
          pollOptions: ['I have a twin', 'I hate coffee', 'I once met a president'],
          gameCorrectIndex: 1,
          mediaUrl: null,
          isBlurred: false,
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.gameCardResponse.findMany.mockResolvedValue([]);

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(messages[0].gameCard?.correctOptionIndex).toBe(1);
    });
  });

  describe('listMessages moderation removal', () => {
    it('withholds content and mediaUrl once a report confirmed a violation', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: MAN_ID,
          contentType: 'IMAGE',
          content: null,
          mediaUrl: 'https://example.com/photo.jpg',
          isBlurred: false,
          moderationRemovedAt: new Date('2026-01-01T00:10:00.000Z'),
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(messages[0].mediaUrl).toBeNull();
      expect(messages[0].moderationRemoved).toBe(true);
    });

    it('leaves content untouched when no removal has happened', async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: MAN_ID,
          contentType: 'TEXT',
          content: 'hey there',
          mediaUrl: null,
          isBlurred: false,
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const messages = await service.listMessages(WOMAN_ID, MATCH_ID);

      expect(messages[0].content).toBe('hey there');
      expect(messages[0].moderationRemoved).toBe(false);
    });
  });

  describe('listMessages poll hydration', () => {
    it("includes vote tallies when listing a conversation", async () => {
      mockMatch();
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'message-1',
          senderId: WOMAN_ID,
          contentType: 'POLL',
          content: 'Where should we go?',
          pollOptions: ['Coffee', 'Dinner'],
          mediaUrl: null,
          isBlurred: false,
          readAt: new Date('2026-01-01T00:05:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.pollVote.findMany.mockResolvedValue([
        { messageId: 'message-1', userId: WOMAN_ID, optionIndex: 0 },
        { messageId: 'message-1', userId: MAN_ID, optionIndex: 0 },
      ]);

      const messages = await service.listMessages(MAN_ID, MATCH_ID);

      expect(prisma.pollVote.findMany).toHaveBeenCalledWith({
        where: { messageId: { in: ['message-1'] } },
      });
      expect(messages[0].poll).toEqual({
        question: 'Where should we go?',
        options: ['Coffee', 'Dinner'],
        myOptionIndex: 0,
        voteCounts: [2, 0],
        totalVotes: 2,
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
        data: { userAId: WOMAN_ID, userBId: MAN_ID, unmatchReason: null },
      });
      expect(matches).toEqual([]);
      // Only the unmatch-protection check (inside dissolveMatch) calls this -
      // the empty match list itself never needs to fetch other-user profiles.
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [WOMAN_ID, MAN_ID] } },
        select: { id: true, unmatchProtectionEnabled: true },
      });
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

    it('excludes a thread whose last message is 14+ days old', async () => {
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
        { matchId: MATCH_ID, senderId: MAN_ID, createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      ]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(matches).toEqual([]);
    });

    it('does not exclude an unmessaged match even if it is old', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(24),
          firstMessageSentAt: null,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);

      const matches = await service.listMyMatches(WOMAN_ID);

      expect(matches).toHaveLength(1);
    });

    it('sends a first-move reminder to the designated first-mover as the deadline nears', async () => {
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(2),
          firstMessageSentAt: null,
          firstMoveReminderSentAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);

      await service.listMyMatches(WOMAN_ID);

      expect(notificationsService.notify).toHaveBeenCalledWith(
        WOMAN_ID,
        'MATCH_EXPIRING_SOON',
        'Your match is about to expire',
        'Send the first message before this match disappears!',
        { matchId: MATCH_ID },
      );
      expect(notificationsService.notify).not.toHaveBeenCalledWith(
        MAN_ID,
        'MATCH_EXPIRING_SOON',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: MATCH_ID },
        data: { firstMoveReminderSentAt: expect.any(Date) },
      });
    });

    it('does not send a first-move reminder outside the deadline window', async () => {
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(24),
          firstMessageSentAt: null,
          firstMoveReminderSentAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);

      await service.listMyMatches(WOMAN_ID);

      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('does not re-send a first-move reminder once already sent', async () => {
      mockUsers({ [WOMAN_ID]: ['Woman'], [MAN_ID]: ['Man'] });
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(2),
          firstMessageSentAt: null,
          firstMoveReminderSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);

      await service.listMyMatches(WOMAN_ID);

      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(prisma.match.update).not.toHaveBeenCalled();
    });
  });

  describe('searchMatches', () => {
    it('returns nothing for an empty or whitespace-only query', async () => {
      const result = await service.searchMatches(WOMAN_ID, '   ');

      expect(result).toEqual([]);
      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });

    it('matches on the other user name', async () => {
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
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Samantha', profilePhotoUrl: null, interests: [] }]);
      prisma.message.findMany.mockResolvedValue([]);

      const result = await service.searchMatches(WOMAN_ID, 'sam');

      expect(result).toHaveLength(1);
      expect(result[0].matchId).toBe(MATCH_ID);
    });

    it('matches on a shared interest', async () => {
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
        { id: MAN_ID, name: 'Sam', profilePhotoUrl: null, interests: ['Rock Climbing'] },
      ]);
      prisma.message.findMany.mockResolvedValue([]);

      const result = await service.searchMatches(WOMAN_ID, 'climbing');

      expect(result).toHaveLength(1);
    });

    it('matches on a keyword found in the chat history', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-1),
          firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null, interests: [] }]);
      prisma.message.findMany
        .mockResolvedValueOnce([{ matchId: MATCH_ID, senderId: MAN_ID, createdAt: new Date() }])
        .mockResolvedValueOnce([{ matchId: MATCH_ID, content: 'Want to grab sushi tonight?' }]);

      const result = await service.searchMatches(WOMAN_ID, 'sushi');

      expect(result).toHaveLength(1);
    });

    it('excludes a match that matches nothing', async () => {
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
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null, interests: [] }]);
      prisma.message.findMany.mockResolvedValue([]);

      const result = await service.searchMatches(WOMAN_ID, 'unrelated-keyword');

      expect(result).toEqual([]);
    });
  });

  describe('listInactiveThreads', () => {
    it('returns a thread whose last message is 14+ days old, with the other user profile info', async () => {
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
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: 'sam.jpg' }]);
      const lastMessageAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, senderId: MAN_ID, createdAt: lastMessageAt },
      ]);

      const threads = await service.listInactiveThreads(WOMAN_ID);

      expect(threads).toEqual([
        {
          matchId: MATCH_ID,
          otherUserId: MAN_ID,
          otherUserName: 'Sam',
          otherUserPhotoUrl: 'sam.jpg',
          lastMessageAt: lastMessageAt.toISOString(),
        },
      ]);
    });

    it('does not include a recently-active thread', async () => {
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

      const threads = await service.listInactiveThreads(WOMAN_ID);

      expect(threads).toEqual([]);
    });

    it('does not include an unmessaged match', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(24),
          firstMessageSentAt: null,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);

      const threads = await service.listInactiveThreads(WOMAN_ID);

      expect(threads).toEqual([]);
    });

    it('treats a recent manual restore as fresh activity, keeping the thread out of the inactive list', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-100),
          firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          manuallyRestoredAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, senderId: MAN_ID, createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
      ]);

      const threads = await service.listInactiveThreads(WOMAN_ID);

      expect(threads).toEqual([]);
    });

    it('ignores a manual restore that is older than the last message', async () => {
      const lastMessageAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-100),
          firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          manuallyRestoredAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, senderId: MAN_ID, createdAt: lastMessageAt },
      ]);

      const threads = await service.listInactiveThreads(WOMAN_ID);

      expect(threads).toEqual([
        {
          matchId: MATCH_ID,
          otherUserId: MAN_ID,
          otherUserName: 'Sam',
          otherUserPhotoUrl: null,
          lastMessageAt: lastMessageAt.toISOString(),
        },
      ]);
    });
  });

  describe('restoreInactiveThread', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(service.restoreInactiveThread('stranger', MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('sets manuallyRestoredAt and returns the thread in the active list', async () => {
      mockMatch({ firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z') });
      prisma.match.findMany.mockResolvedValue([
        {
          id: MATCH_ID,
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          firstMessageExpiresAt: hoursFromNow(-100),
          firstMessageSentAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          manuallyRestoredAt: new Date(),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, senderId: MAN_ID, createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
      ]);

      const result = await service.restoreInactiveThread(WOMAN_ID, MATCH_ID);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: MATCH_ID },
        data: { manuallyRestoredAt: expect.any(Date) },
      });
      expect(result.matchId).toBe(MATCH_ID);
      expect(result.otherUserName).toBe('Sam');
    });
  });

  describe('unmatch', () => {
    it('throws when the user is not part of the match', async () => {
      mockMatch();

      await expect(service.unmatch('someone-else', MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an unknown unmatch reason', async () => {
      mockMatch();

      await expect(
        service.unmatch(WOMAN_ID, MATCH_ID, 'made up reason'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.dissolvedMatch.create).not.toHaveBeenCalled();
    });

    it('stores a valid quick-pick reason on the dissolved match record', async () => {
      mockMatch({ firstMessageSentAt: new Date() });

      await service.unmatch(WOMAN_ID, MATCH_ID, 'Stopped responding');

      expect(prisma.dissolvedMatch.create).toHaveBeenCalledWith({
        data: { userAId: WOMAN_ID, userBId: MAN_ID, unmatchReason: 'Stopped responding' },
      });
    });

    it('deletes the messages, swipes, and match, and records a reconnect trace', async () => {
      mockMatch({ firstMessageSentAt: new Date() });

      const result = await service.unmatch(WOMAN_ID, MATCH_ID);

      expect(prisma.message.deleteMany).toHaveBeenCalledWith({ where: { matchId: MATCH_ID } });
      expect(prisma.match.delete).toHaveBeenCalledWith({ where: { id: MATCH_ID } });
      expect(prisma.dissolvedMatch.create).toHaveBeenCalledWith({
        data: { userAId: WOMAN_ID, userBId: MAN_ID, unmatchReason: null },
      });
      expect(result).toEqual({ unmatched: true });
    });

    it('does not archive messages when neither side has unmatch protection', async () => {
      mockMatch({ firstMessageSentAt: new Date() });
      prisma.user.findMany.mockResolvedValue([
        { id: WOMAN_ID, unmatchProtectionEnabled: false },
        { id: MAN_ID, unmatchProtectionEnabled: false },
      ]);

      await service.unmatch(WOMAN_ID, MATCH_ID);

      expect(prisma.archivedMessage.createMany).not.toHaveBeenCalled();
    });

    it("archives messages when either side has unmatch protection enabled", async () => {
      mockMatch({ firstMessageSentAt: new Date() });
      prisma.user.findMany.mockResolvedValue([
        { id: WOMAN_ID, unmatchProtectionEnabled: false },
        { id: MAN_ID, unmatchProtectionEnabled: true },
      ]);
      prisma.dissolvedMatch.create.mockResolvedValue({ id: 'dissolved-1' });
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      await service.unmatch(WOMAN_ID, MATCH_ID);

      expect(prisma.archivedMessage.createMany).toHaveBeenCalledWith({
        data: [
          {
            dissolvedMatchId: 'dissolved-1',
            senderId: WOMAN_ID,
            contentType: 'TEXT',
            content: 'hi',
            mediaUrl: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      });
    });

    it('does not create archivedMessage rows for a protected match with no messages', async () => {
      mockMatch({ firstMessageSentAt: null });
      prisma.user.findMany.mockResolvedValue([{ id: WOMAN_ID, unmatchProtectionEnabled: true }]);
      prisma.dissolvedMatch.create.mockResolvedValue({ id: 'dissolved-1' });
      prisma.message.findMany.mockResolvedValue([]);

      await service.unmatch(WOMAN_ID, MATCH_ID);

      expect(prisma.archivedMessage.createMany).not.toHaveBeenCalled();
    });
  });

  describe('listArchivedThreads', () => {
    it('returns an empty list when nothing is dissolved', async () => {
      prisma.dissolvedMatch.findMany.mockResolvedValue([]);

      const result = await service.listArchivedThreads(WOMAN_ID);

      expect(result).toEqual([]);
    });

    it('excludes dissolved matches with no archived messages', async () => {
      prisma.dissolvedMatch.findMany.mockResolvedValue([
        { id: 'dissolved-1', userAId: WOMAN_ID, userBId: MAN_ID, dissolvedAt: new Date() },
      ]);
      prisma.archivedMessage.findMany.mockResolvedValue([]);

      const result = await service.listArchivedThreads(WOMAN_ID);

      expect(result).toEqual([]);
    });

    it('includes dissolved matches that have archived messages, with a count and other-user info', async () => {
      prisma.dissolvedMatch.findMany.mockResolvedValue([
        {
          id: 'dissolved-1',
          userAId: WOMAN_ID,
          userBId: MAN_ID,
          dissolvedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.archivedMessage.findMany.mockResolvedValue([
        { dissolvedMatchId: 'dissolved-1' },
        { dissolvedMatchId: 'dissolved-1' },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: MAN_ID, name: 'Sam', profilePhotoUrl: null }]);

      const result = await service.listArchivedThreads(WOMAN_ID);

      expect(result).toEqual([
        {
          dissolvedMatchId: 'dissolved-1',
          otherUserId: MAN_ID,
          otherUserName: 'Sam',
          otherUserPhotoUrl: null,
          dissolvedAt: '2026-01-01T00:00:00.000Z',
          messageCount: 2,
        },
      ]);
    });
  });

  describe('getArchivedThreadMessages', () => {
    it('throws when the archived thread does not exist', async () => {
      prisma.dissolvedMatch.findUnique.mockResolvedValue(null);

      await expect(
        service.getArchivedThreadMessages(WOMAN_ID, 'dissolved-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws when the thread doesn't belong to the requesting user", async () => {
      prisma.dissolvedMatch.findUnique.mockResolvedValue({
        id: 'dissolved-1',
        userAId: MAN_ID,
        userBId: 'someone-else',
      });

      await expect(
        service.getArchivedThreadMessages(WOMAN_ID, 'dissolved-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the archived messages in order', async () => {
      prisma.dissolvedMatch.findUnique.mockResolvedValue({
        id: 'dissolved-1',
        userAId: WOMAN_ID,
        userBId: MAN_ID,
      });
      prisma.archivedMessage.findMany.mockResolvedValue([
        {
          id: 'am-1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getArchivedThreadMessages(WOMAN_ID, 'dissolved-1');

      expect(prisma.archivedMessage.findMany).toHaveBeenCalledWith({
        where: { dissolvedMatchId: 'dissolved-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'am-1',
          senderId: WOMAN_ID,
          contentType: 'TEXT',
          content: 'hi',
          mediaUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
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
        createdAt: new Date(),
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
