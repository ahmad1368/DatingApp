import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpeedDatingService } from './speed-dating.service';
import { EVENT_DAY_OF_WEEK, EVENT_START_HOUR_UTC } from './speed-dating.constants';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';
const OUTSIDER_ID = 'user-3';
const ROUND_ID = 'round-1';

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function liveEventTime(): Date {
  const now = new Date();
  const live = new Date(now);
  live.setUTCHours(EVENT_START_HOUR_UTC, 0, 0, 0);
  const dayDiff = (EVENT_DAY_OF_WEEK - live.getUTCDay() + 7) % 7;
  live.setUTCDate(live.getUTCDate() + dayDiff);
  return live;
}

describe('SpeedDatingService', () => {
  let service: SpeedDatingService;
  let prisma: {
    speedDatingQueueEntry: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock; deleteMany: jest.Mock };
    speedDatingRound: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    speedDatingIceCandidate: { create: jest.Mock; findMany: jest.Mock };
    blockedContact: { findMany: jest.Mock };
    match: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      speedDatingQueueEntry: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      speedDatingRound: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      speedDatingIceCandidate: { create: jest.fn(), findMany: jest.fn() },
      blockedContact: { findMany: jest.fn().mockResolvedValue([]) },
      match: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new SpeedDatingService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getEventSchedule', () => {
    it('reports whether the weekly event is currently live', () => {
      jest.useFakeTimers().setSystemTime(liveEventTime());

      expect(service.getEventSchedule().live).toBe(true);
    });

    it('reports not live outside the event window', () => {
      const outside = liveEventTime();
      outside.setUTCDate(outside.getUTCDate() + 1);
      jest.useFakeTimers().setSystemTime(outside);

      expect(service.getEventSchedule().live).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('reports NONE when the user has never queued or been paired', async () => {
      prisma.speedDatingRound.findFirst.mockResolvedValue(null);
      prisma.speedDatingQueueEntry.findUnique.mockResolvedValue(null);

      const status = await service.getStatus(USER_ID);

      expect(status).toEqual({
        status: 'NONE',
        roundId: null,
        endsAt: null,
        myDecision: null,
        otherDecided: false,
        matched: false,
      });
    });

    it('reports WAITING while queued', async () => {
      prisma.speedDatingRound.findFirst.mockResolvedValue(null);
      prisma.speedDatingQueueEntry.findUnique.mockResolvedValue({ userId: USER_ID });

      const status = await service.getStatus(USER_ID);

      expect(status.status).toBe('WAITING');
    });

    it('reports IN_ROUND for a round still running', async () => {
      prisma.speedDatingRound.findFirst.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });

      const status = await service.getStatus(USER_ID);

      expect(status.status).toBe('IN_ROUND');
      expect(status.roundId).toBe(ROUND_ID);
    });

    it('reports ENDED for a finished round with nobody queued', async () => {
      prisma.speedDatingRound.findFirst.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(-1),
        offerSdp: null,
        answerSdp: null,
        userADecision: true,
        userBDecision: null,
        matchId: null,
      });
      prisma.speedDatingQueueEntry.findUnique.mockResolvedValue(null);

      const status = await service.getStatus(USER_ID);

      expect(status.status).toBe('ENDED');
      expect(status.myDecision).toBe(true);
      expect(status.otherDecided).toBe(false);
    });

    it('does not reveal the other side decision, only whether they decided', async () => {
      prisma.speedDatingRound.findFirst.mockResolvedValue({
        id: ROUND_ID,
        userAId: OTHER_ID,
        userBId: USER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: false,
        userBDecision: null,
        matchId: null,
      });

      const status = await service.getStatus(USER_ID);

      expect(status.otherDecided).toBe(true);
      expect(status).not.toHaveProperty('otherDecision');
    });
  });

  describe('joinQueue', () => {
    it('rejects joining outside the scheduled weekly window', async () => {
      const outside = liveEventTime();
      outside.setUTCDate(outside.getUTCDate() + 1);
      jest.useFakeTimers().setSystemTime(outside);

      await expect(service.joinQueue(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.speedDatingRound.findFirst).not.toHaveBeenCalled();
    });

    it('rejects joining while already in a running round', async () => {
      jest.useFakeTimers().setSystemTime(liveEventTime());
      prisma.speedDatingRound.findFirst.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });

      await expect(service.joinQueue(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('starts waiting when nobody else is queued', async () => {
      jest.useFakeTimers().setSystemTime(liveEventTime());
      prisma.speedDatingRound.findFirst.mockResolvedValue(null);
      prisma.speedDatingQueueEntry.findUnique.mockResolvedValueOnce(null); // not already queued
      prisma.speedDatingQueueEntry.findFirst.mockResolvedValue(null); // nobody waiting
      prisma.speedDatingQueueEntry.findUnique.mockResolvedValueOnce({ userId: USER_ID }); // getStatus recheck

      const status = await service.joinQueue(USER_ID);

      expect(prisma.speedDatingQueueEntry.create).toHaveBeenCalledWith({ data: { userId: USER_ID } });
      expect(status.status).toBe('WAITING');
    });

    it('pairs with the longest-waiting eligible stranger, excluding blocked users', async () => {
      jest.useFakeTimers().setSystemTime(liveEventTime());
      const [userAId, userBId] = [USER_ID, OTHER_ID].sort();
      prisma.speedDatingRound.findFirst
        .mockResolvedValueOnce(null) // active-round check
        .mockResolvedValueOnce({
          id: ROUND_ID,
          userAId,
          userBId,
          endsAt: minutesFromNow(3),
          offerSdp: null,
          answerSdp: null,
          userADecision: null,
          userBDecision: null,
          matchId: null,
        }); // getStatus recheck after pairing
      prisma.speedDatingQueueEntry.findUnique.mockResolvedValueOnce(null); // not already queued
      prisma.blockedContact.findMany.mockResolvedValueOnce([{ blockedUserId: OUTSIDER_ID }]).mockResolvedValueOnce([]);
      prisma.speedDatingQueueEntry.findFirst.mockResolvedValue({ userId: OTHER_ID });

      const status = await service.joinQueue(USER_ID);

      expect(prisma.speedDatingQueueEntry.findFirst).toHaveBeenCalledWith({
        where: { userId: { notIn: [USER_ID, OUTSIDER_ID] } },
        orderBy: { joinedAt: 'asc' },
      });
      expect(prisma.speedDatingQueueEntry.delete).toHaveBeenCalledWith({ where: { userId: OTHER_ID } });
      expect(prisma.speedDatingRound.create).toHaveBeenCalledWith({
        data: { userAId, userBId, endsAt: expect.any(Date) },
      });
      expect(status.status).toBe('IN_ROUND');
    });

    it('is idempotent when already queued', async () => {
      jest.useFakeTimers().setSystemTime(liveEventTime());
      prisma.speedDatingRound.findFirst.mockResolvedValue(null);
      prisma.speedDatingQueueEntry.findUnique.mockResolvedValue({ userId: USER_ID });

      const status = await service.joinQueue(USER_ID);

      expect(prisma.speedDatingQueueEntry.create).not.toHaveBeenCalled();
      expect(status.status).toBe('WAITING');
    });
  });

  describe('leaveQueue', () => {
    it('removes the queue entry', async () => {
      await service.leaveQueue(USER_ID);

      expect(prisma.speedDatingQueueEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    });
  });

  describe('signaling', () => {
    it('throws when the round does not belong to the user', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: OTHER_ID,
        userBId: OUTSIDER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });

      await expect(service.submitOffer(USER_ID, ROUND_ID, 'sdp')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects signaling after the round has ended', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(-1),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });

      await expect(service.submitOffer(USER_ID, ROUND_ID, 'sdp')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an answer before an offer exists', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });

      await expect(service.submitAnswer(USER_ID, ROUND_ID, 'sdp')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records the offer', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });
      prisma.speedDatingRound.update.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: 'sdp-offer',
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });

      await service.submitOffer(USER_ID, ROUND_ID, 'sdp-offer');

      expect(prisma.speedDatingRound.update).toHaveBeenCalledWith({
        where: { id: ROUND_ID },
        data: { offerSdp: 'sdp-offer' },
      });
    });

    it('only returns ICE candidates from the other participant', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });
      prisma.speedDatingIceCandidate.findMany.mockResolvedValue([
        { id: 'ice-1', senderId: OTHER_ID, candidate: 'c1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);

      const candidates = await service.listIceCandidatesFromPeer(USER_ID, ROUND_ID);

      expect(prisma.speedDatingIceCandidate.findMany).toHaveBeenCalledWith({
        where: { roundId: ROUND_ID, senderId: { not: USER_ID } },
        orderBy: { createdAt: 'asc' },
      });
      expect(candidates).toEqual([
        { id: 'ice-1', senderId: OTHER_ID, candidate: 'c1', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
    });
  });

  describe('decideRound', () => {
    it('does not match until both sides opt in', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: null,
        userBDecision: null,
        matchId: null,
      });
      prisma.speedDatingRound.update.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: true,
        userBDecision: null,
        matchId: null,
      });

      const status = await service.decideRound(USER_ID, ROUND_ID, true);

      expect(prisma.match.create).not.toHaveBeenCalled();
      expect(status.matched).toBe(false);
      expect(status.myDecision).toBe(true);
    });

    it('creates a match once both sides opt in', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: true,
        userBDecision: null,
        matchId: null,
      });
      prisma.speedDatingRound.update
        .mockResolvedValueOnce({
          id: ROUND_ID,
          userAId: USER_ID,
          userBId: OTHER_ID,
          endsAt: minutesFromNow(2),
          offerSdp: null,
          answerSdp: null,
          userADecision: true,
          userBDecision: true,
          matchId: null,
        })
        .mockResolvedValueOnce({
          id: ROUND_ID,
          userAId: USER_ID,
          userBId: OTHER_ID,
          endsAt: minutesFromNow(2),
          offerSdp: null,
          answerSdp: null,
          userADecision: true,
          userBDecision: true,
          matchId: 'match-1',
        });
      prisma.match.create.mockResolvedValue({ id: 'match-1' });

      const status = await service.decideRound(OTHER_ID, ROUND_ID, true);

      const [userAId, userBId] = [USER_ID, OTHER_ID].sort();
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: { userAId, userBId, firstMessageExpiresAt: expect.any(Date) },
      });
      expect(prisma.speedDatingRound.update).toHaveBeenNthCalledWith(2, {
        where: { id: ROUND_ID },
        data: { matchId: 'match-1' },
      });
      expect(status.matched).toBe(true);
    });

    it('does not create a duplicate match if one already exists', async () => {
      prisma.speedDatingRound.findUnique.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: true,
        userBDecision: true,
        matchId: 'match-1',
      });
      prisma.speedDatingRound.update.mockResolvedValue({
        id: ROUND_ID,
        userAId: USER_ID,
        userBId: OTHER_ID,
        endsAt: minutesFromNow(2),
        offerSdp: null,
        answerSdp: null,
        userADecision: true,
        userBDecision: true,
        matchId: 'match-1',
      });

      const status = await service.decideRound(USER_ID, ROUND_ID, true);

      expect(prisma.match.create).not.toHaveBeenCalled();
      expect(status.matched).toBe(true);
    });
  });
});
