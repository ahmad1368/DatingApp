import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
    match: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock; delete: jest.Mock };
    message: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    swipe: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      swipe: { deleteMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new MessagingService(prisma as unknown as PrismaService);
  });

  function mockMatch(overrides: Partial<{
    firstMessageExpiresAt: Date;
    firstMessageSentAt: Date | null;
  }> = {}) {
    prisma.match.findUnique.mockResolvedValue({
      id: MATCH_ID,
      userAId: WOMAN_ID,
      userBId: MAN_ID,
      firstMessageExpiresAt: hoursFromNow(24),
      firstMessageSentAt: null,
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
      expect(result).toEqual({
        id: 'message-1',
        senderId: WOMAN_ID,
        contentType: 'TEXT',
        content: 'hi',
        mediaUrl: null,
        isBlurred: false,
        readAt: null,
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
        },
      });
      expect(result.isBlurred).toBe(true);
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
        },
      });
      expect(result.isBlurred).toBe(false);
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
          readAt: null,
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
          createdAt: '2026-01-01T00:00:00.000Z',
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
      expect(prisma.swipe.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { swiperId: WOMAN_ID, targetUserId: MAN_ID },
            { swiperId: MAN_ID, targetUserId: WOMAN_ID },
          ],
        },
      });
      expect(prisma.match.delete).toHaveBeenCalledWith({ where: { id: MATCH_ID } });
      expect(matches).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});
