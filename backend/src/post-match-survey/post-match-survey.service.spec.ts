import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostMatchSurveyService } from './post-match-survey.service';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const OUTSIDER_ID = 'user-3';
const MATCH_ID = 'match-1';

describe('PostMatchSurveyService', () => {
  let service: PostMatchSurveyService;
  let prisma: {
    match: { findUnique: jest.Mock; findMany: jest.Mock };
    postMatchSurvey: { upsert: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    message: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn(), findMany: jest.fn() },
      postMatchSurvey: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PostMatchSurveyService(prisma as unknown as PrismaService);
  });

  function mockMatch() {
    prisma.match.findUnique.mockResolvedValue({
      id: MATCH_ID,
      userAId: USER_ID,
      userBId: OTHER_USER_ID,
    });
  }

  describe('submitSurvey', () => {
    it('throws when the match does not exist', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(
        service.submitSurvey(USER_ID, MATCH_ID, false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the requester is not part of the match', async () => {
      mockMatch();

      await expect(
        service.submitSurvey(OUTSIDER_ID, MATCH_ID, false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires a matchQuality when they met in person', async () => {
      mockMatch();

      await expect(
        service.submitSurvey(USER_ID, MATCH_ID, true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.postMatchSurvey.upsert).not.toHaveBeenCalled();
    });

    it('ignores a matchQuality when they never met in person', async () => {
      mockMatch();
      prisma.postMatchSurvey.upsert.mockResolvedValue({
        matchId: MATCH_ID,
        metInPerson: false,
        matchQuality: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.submitSurvey(USER_ID, MATCH_ID, false, 'GREAT');

      expect(prisma.postMatchSurvey.upsert).toHaveBeenCalledWith({
        where: { matchId_userId: { matchId: MATCH_ID, userId: USER_ID } },
        create: { matchId: MATCH_ID, userId: USER_ID, metInPerson: false, matchQuality: null },
        update: { metInPerson: false, matchQuality: null },
      });
      expect(result.matchQuality).toBeNull();
    });

    it('records a met-in-person survey with its quality rating', async () => {
      mockMatch();
      prisma.postMatchSurvey.upsert.mockResolvedValue({
        matchId: MATCH_ID,
        metInPerson: true,
        matchQuality: 'GREAT',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.user.findUnique.mockResolvedValue({ discoveryProximityWeight: 1 });

      const result = await service.submitSurvey(USER_ID, MATCH_ID, true, 'GREAT');

      expect(prisma.postMatchSurvey.upsert).toHaveBeenCalledWith({
        where: { matchId_userId: { matchId: MATCH_ID, userId: USER_ID } },
        create: { matchId: MATCH_ID, userId: USER_ID, metInPerson: true, matchQuality: 'GREAT' },
        update: { metInPerson: true, matchQuality: 'GREAT' },
      });
      expect(result).toEqual({
        matchId: MATCH_ID,
        metInPerson: true,
        matchQuality: 'GREAT',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('nudges discoveryProximityWeight down for a great in-person outcome (algorithm training)', async () => {
      mockMatch();
      prisma.postMatchSurvey.upsert.mockResolvedValue({
        matchId: MATCH_ID,
        metInPerson: true,
        matchQuality: 'GREAT',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.user.findUnique.mockResolvedValue({ discoveryProximityWeight: 1 });

      await service.submitSurvey(USER_ID, MATCH_ID, true, 'GREAT');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { discoveryProximityWeight: 0.85 },
      });
    });

    it('nudges discoveryProximityWeight up for a poor in-person outcome (algorithm training)', async () => {
      mockMatch();
      prisma.postMatchSurvey.upsert.mockResolvedValue({
        matchId: MATCH_ID,
        metInPerson: true,
        matchQuality: 'POOR',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.user.findUnique.mockResolvedValue({ discoveryProximityWeight: 1 });

      await service.submitSurvey(USER_ID, MATCH_ID, true, 'POOR');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { discoveryProximityWeight: 1.2 },
      });
    });

    it('does not nudge the weight when the pair never met in person', async () => {
      mockMatch();
      prisma.postMatchSurvey.upsert.mockResolvedValue({
        matchId: MATCH_ID,
        metInPerson: false,
        matchQuality: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.submitSurvey(USER_ID, MATCH_ID, false);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getMySurvey', () => {
    it('throws when the requester is not part of the match', async () => {
      mockMatch();

      await expect(
        service.getMySurvey(OUTSIDER_ID, MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns null when no survey has been submitted yet', async () => {
      mockMatch();
      prisma.postMatchSurvey.findUnique.mockResolvedValue(null);

      const result = await service.getMySurvey(USER_ID, MATCH_ID);

      expect(result).toBeNull();
    });

    it('returns the stored survey', async () => {
      mockMatch();
      prisma.postMatchSurvey.findUnique.mockResolvedValue({
        matchId: MATCH_ID,
        metInPerson: true,
        matchQuality: 'GOOD',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.getMySurvey(USER_ID, MATCH_ID);

      expect(result).toEqual({
        matchId: MATCH_ID,
        metInPerson: true,
        matchQuality: 'GOOD',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('listDuePrompts', () => {
    function daysAgo(days: number): Date {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    it('returns nothing when the user has no matches', async () => {
      prisma.match.findMany.mockResolvedValue([]);

      const result = await service.listDuePrompts(USER_ID);

      expect(result).toEqual([]);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('excludes a match that already has a survey from this user', async () => {
      prisma.match.findMany.mockResolvedValue([{ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, content: 'call me at 555-123-4567', createdAt: daysAgo(5) },
      ]);
      prisma.postMatchSurvey.findMany.mockResolvedValue([{ matchId: MATCH_ID }]);

      const result = await service.listDuePrompts(USER_ID);

      expect(result).toEqual([]);
    });

    it('is not due yet when the phone-number signal is too recent', async () => {
      prisma.match.findMany.mockResolvedValue([{ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, content: 'call me at 555-123-4567', createdAt: daysAgo(0.5) },
      ]);

      const result = await service.listDuePrompts(USER_ID);

      expect(result).toEqual([]);
    });

    it('flags a PHONE_NUMBER_EXCHANGE prompt once the delay has passed', async () => {
      prisma.match.findMany.mockResolvedValue([{ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, content: 'text me 555-123-4567 anytime', createdAt: daysAgo(5) },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: OTHER_USER_ID, name: 'Alex' }]);

      const result = await service.listDuePrompts(USER_ID);

      expect(result).toEqual([
        { matchId: MATCH_ID, reason: 'PHONE_NUMBER_EXCHANGE', otherUserId: OTHER_USER_ID, otherUserName: 'Alex' },
      ]);
    });

    it('flags a LONG_CHAT_STREAK prompt once the thread is long enough and old enough', async () => {
      prisma.match.findMany.mockResolvedValue([{ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID }]);
      const messages = Array.from({ length: 25 }, (_, index) => ({
        matchId: MATCH_ID,
        content: `message ${index}`,
        createdAt: daysAgo(10 - index * 0.1),
      }));
      prisma.message.findMany.mockResolvedValue(messages);
      prisma.user.findMany.mockResolvedValue([{ id: OTHER_USER_ID, name: 'Alex' }]);

      const result = await service.listDuePrompts(USER_ID);

      expect(result).toEqual([
        { matchId: MATCH_ID, reason: 'LONG_CHAT_STREAK', otherUserId: OTHER_USER_ID, otherUserName: 'Alex' },
      ]);
    });

    it('is not due when the thread is short and has no phone-number signal', async () => {
      prisma.match.findMany.mockResolvedValue([{ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID }]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID, content: 'hey!', createdAt: daysAgo(10) },
      ]);

      const result = await service.listDuePrompts(USER_ID);

      expect(result).toEqual([]);
    });
  });
});
