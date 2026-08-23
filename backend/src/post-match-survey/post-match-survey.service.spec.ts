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
    match: { findUnique: jest.Mock };
    postMatchSurvey: { upsert: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn() },
      postMatchSurvey: { upsert: jest.fn(), findUnique: jest.fn() },
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
});
