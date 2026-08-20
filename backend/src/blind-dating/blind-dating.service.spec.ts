import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlindDatingService } from './blind-dating.service';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';
const OUTSIDER_ID = 'user-3';
const SESSION_ID = 'session-1';

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

describe('BlindDatingService', () => {
  let service: BlindDatingService;
  let prisma: {
    blindDateQueueEntry: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock; deleteMany: jest.Mock };
    blindDateSession: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    blindDateMessage: { create: jest.Mock; findMany: jest.Mock };
    blockedContact: { findMany: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      blindDateQueueEntry: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      blindDateSession: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      blindDateMessage: { create: jest.fn(), findMany: jest.fn() },
      blockedContact: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new BlindDatingService(prisma as unknown as PrismaService);
  });

  describe('getStatus', () => {
    it('reports NONE when the user has never queued or matched', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue(null);
      prisma.blindDateQueueEntry.findUnique.mockResolvedValue(null);

      const status = await service.getStatus(USER_ID);

      expect(status).toEqual({
        status: 'NONE',
        sessionId: null,
        expiresAt: null,
        isRevealed: false,
        myRevealRequested: false,
        otherRevealRequested: false,
        otherProfile: null,
      });
    });

    it('reports WAITING while queued', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue(null);
      prisma.blindDateQueueEntry.findUnique.mockResolvedValue({ userId: USER_ID });

      const status = await service.getStatus(USER_ID);

      expect(status.status).toBe('WAITING');
    });

    it('reports ACTIVE for an unexpired session', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(5),
        userARevealRequested: false,
        userBRevealRequested: false,
        revealedAt: null,
      });

      const status = await service.getStatus(USER_ID);

      expect(status.status).toBe('ACTIVE');
      expect(status.sessionId).toBe(SESSION_ID);
      expect(status.isRevealed).toBe(false);
    });

    it('reports ENDED for an expired session with nobody queued', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(-1),
        userARevealRequested: false,
        userBRevealRequested: false,
        revealedAt: null,
      });
      prisma.blindDateQueueEntry.findUnique.mockResolvedValue(null);

      const status = await service.getStatus(USER_ID);

      expect(status.status).toBe('ENDED');
    });

    it('includes the other profile once revealed', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(5),
        userARevealRequested: true,
        userBRevealRequested: true,
        revealedAt: new Date(),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: OTHER_ID,
        name: 'Alex',
        profilePhotoUrl: 'alex.jpg',
      });

      const status = await service.getStatus(USER_ID);

      expect(status.isRevealed).toBe(true);
      expect(status.otherProfile).toEqual({ id: OTHER_ID, name: 'Alex', profilePhotoUrl: 'alex.jpg' });
    });
  });

  describe('joinQueue', () => {
    it('rejects joining while already in an active session', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(5),
        userARevealRequested: false,
        userBRevealRequested: false,
        revealedAt: null,
      });

      await expect(service.joinQueue(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('starts waiting when nobody else is queued', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue(null);
      prisma.blindDateQueueEntry.findUnique.mockResolvedValueOnce(null); // not already queued
      prisma.blindDateQueueEntry.findFirst.mockResolvedValue(null); // nobody waiting
      prisma.blindDateQueueEntry.findUnique.mockResolvedValueOnce({ userId: USER_ID }); // getStatus recheck

      const status = await service.joinQueue(USER_ID);

      expect(prisma.blindDateQueueEntry.create).toHaveBeenCalledWith({ data: { userId: USER_ID } });
      expect(status.status).toBe('WAITING');
    });

    it('pairs with the longest-waiting eligible stranger, excluding blocked users', async () => {
      prisma.blindDateSession.findFirst
        .mockResolvedValueOnce(null) // active-session check
        .mockResolvedValueOnce({
          id: SESSION_ID,
          userAId: [USER_ID, OTHER_ID].sort()[0],
          userBId: [USER_ID, OTHER_ID].sort()[1],
          expiresAt: minutesFromNow(10),
          userARevealRequested: false,
          userBRevealRequested: false,
          revealedAt: null,
        }); // getStatus recheck after pairing
      prisma.blindDateQueueEntry.findUnique.mockResolvedValueOnce(null); // not already queued
      prisma.blockedContact.findMany
        .mockResolvedValueOnce([{ blockedUserId: OUTSIDER_ID }])
        .mockResolvedValueOnce([]);
      prisma.blindDateQueueEntry.findFirst.mockResolvedValue({ userId: OTHER_ID });

      const status = await service.joinQueue(USER_ID);

      expect(prisma.blindDateQueueEntry.findFirst).toHaveBeenCalledWith({
        where: { userId: { notIn: [USER_ID, OUTSIDER_ID] } },
        orderBy: { joinedAt: 'asc' },
      });
      expect(prisma.blindDateQueueEntry.delete).toHaveBeenCalledWith({ where: { userId: OTHER_ID } });
      expect(prisma.blindDateSession.create).toHaveBeenCalledWith({
        data: {
          userAId: [USER_ID, OTHER_ID].sort()[0],
          userBId: [USER_ID, OTHER_ID].sort()[1],
          expiresAt: expect.any(Date),
        },
      });
      expect(status.status).toBe('ACTIVE');
    });

    it('is idempotent when already queued', async () => {
      prisma.blindDateSession.findFirst.mockResolvedValue(null);
      prisma.blindDateQueueEntry.findUnique.mockResolvedValue({ userId: USER_ID });

      const status = await service.joinQueue(USER_ID);

      expect(prisma.blindDateQueueEntry.create).not.toHaveBeenCalled();
      expect(status.status).toBe('WAITING');
    });
  });

  describe('leaveQueue', () => {
    it('removes the queue entry', async () => {
      await service.leaveQueue(USER_ID);

      expect(prisma.blindDateQueueEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    });
  });

  describe('sendMessage', () => {
    it('throws when the session does not belong to the user', async () => {
      prisma.blindDateSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userAId: OTHER_ID,
        userBId: OUTSIDER_ID,
        expiresAt: minutesFromNow(5),
      });

      await expect(service.sendMessage(USER_ID, SESSION_ID, 'hi')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects sending after the session has ended', async () => {
      prisma.blindDateSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(-1),
      });

      await expect(service.sendMessage(USER_ID, SESSION_ID, 'hi')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('creates the message', async () => {
      prisma.blindDateSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(5),
      });
      prisma.blindDateMessage.create.mockResolvedValue({
        id: 'message-1',
        senderId: USER_ID,
        content: 'hi',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendMessage(USER_ID, SESSION_ID, 'hi');

      expect(prisma.blindDateMessage.create).toHaveBeenCalledWith({
        data: { sessionId: SESSION_ID, senderId: USER_ID, content: 'hi' },
      });
      expect(result).toEqual({
        id: 'message-1',
        senderId: USER_ID,
        content: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('requestReveal', () => {
    it('does not reveal until both sides have requested it', async () => {
      prisma.blindDateSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(5),
        userARevealRequested: false,
        userBRevealRequested: false,
        revealedAt: null,
      });
      prisma.blindDateSession.update.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(5),
        userARevealRequested: true,
        userBRevealRequested: false,
        revealedAt: null,
      });

      const status = await service.requestReveal(USER_ID, SESSION_ID);

      expect(prisma.blindDateSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { userARevealRequested: true },
      });
      expect(status.isRevealed).toBe(false);
      expect(status.myRevealRequested).toBe(true);
      expect(status.otherRevealRequested).toBe(false);
    });

    it('reveals once both sides have requested it', async () => {
      prisma.blindDateSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        expiresAt: minutesFromNow(5),
        userARevealRequested: false,
        userBRevealRequested: true,
        revealedAt: null,
      });
      prisma.blindDateSession.update
        .mockResolvedValueOnce({
          id: SESSION_ID,
          userAId: USER_ID,
          userBId: OTHER_ID,
          expiresAt: minutesFromNow(5),
          userARevealRequested: true,
          userBRevealRequested: true,
          revealedAt: null,
        })
        .mockResolvedValueOnce({
          id: SESSION_ID,
          userAId: USER_ID,
          userBId: OTHER_ID,
          expiresAt: minutesFromNow(5),
          userARevealRequested: true,
          userBRevealRequested: true,
          revealedAt: new Date(),
        });
      prisma.user.findUnique.mockResolvedValue({ id: OTHER_ID, name: 'Alex', profilePhotoUrl: null });

      const status = await service.requestReveal(USER_ID, SESSION_ID);

      expect(prisma.blindDateSession.update).toHaveBeenNthCalledWith(2, {
        where: { id: SESSION_ID },
        data: { revealedAt: expect.any(Date) },
      });
      expect(status.isRevealed).toBe(true);
      expect(status.otherProfile).toEqual({ id: OTHER_ID, name: 'Alex', profilePhotoUrl: null });
    });
  });
});
