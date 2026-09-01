import { PrismaService } from '../prisma/prisma.service';
import { MatchAnalyticsService } from './match-analytics.service';

const USER_ID = 'user-1';
const MATCH_ID_1 = 'match-1';
const MATCH_ID_2 = 'match-2';

describe('MatchAnalyticsService', () => {
  let service: MatchAnalyticsService;
  let prisma: {
    swipe: { count: jest.Mock };
    match: { findMany: jest.Mock };
    message: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      swipe: { count: jest.fn() },
      match: { findMany: jest.fn() },
      message: { findMany: jest.fn() },
    };
    service = new MatchAnalyticsService(prisma as unknown as PrismaService);
  });

  describe('getMatchInsights', () => {
    it('reports null rates when no likes have been sent and no matches exist', async () => {
      prisma.swipe.count.mockResolvedValue(0);
      prisma.match.findMany.mockResolvedValue([]);

      const insights = await service.getMatchInsights(USER_ID);

      expect(insights).toEqual({
        totalLikesSent: 0,
        totalMatches: 0,
        likeAcceptanceRate: null,
        averageMessageInitiationSeconds: null,
      });
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('computes the like acceptance rate from sent likes vs. matches', async () => {
      prisma.swipe.count.mockResolvedValue(10);
      prisma.match.findMany.mockResolvedValue([
        { id: MATCH_ID_1, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      prisma.message.findMany.mockResolvedValue([]);

      const insights = await service.getMatchInsights(USER_ID);

      expect(insights.totalLikesSent).toBe(10);
      expect(insights.totalMatches).toBe(1);
      expect(insights.likeAcceptanceRate).toBe(0.1);
    });

    it('counts only this user as swiper with a LIKE or SUPER_LIKE action', async () => {
      prisma.swipe.count.mockResolvedValue(0);
      prisma.match.findMany.mockResolvedValue([]);

      await service.getMatchInsights(USER_ID);

      expect(prisma.swipe.count).toHaveBeenCalledWith({
        where: { swiperId: USER_ID, action: { in: ['LIKE', 'SUPER_LIKE'] } },
      });
    });

    it('averages message initiation delay across matches where the user sent a first message', async () => {
      prisma.swipe.count.mockResolvedValue(2);
      prisma.match.findMany.mockResolvedValue([
        { id: MATCH_ID_1, createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: MATCH_ID_2, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID_1, createdAt: new Date('2026-01-01T00:01:00.000Z') },
        { matchId: MATCH_ID_2, createdAt: new Date('2026-01-01T00:11:00.000Z') },
      ]);

      const insights = await service.getMatchInsights(USER_ID);

      expect(insights.averageMessageInitiationSeconds).toBe(360);
    });

    it('ignores a later message in the same match beyond the first', async () => {
      prisma.swipe.count.mockResolvedValue(1);
      prisma.match.findMany.mockResolvedValue([
        { id: MATCH_ID_1, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID_1, createdAt: new Date('2026-01-01T00:01:00.000Z') },
        { matchId: MATCH_ID_1, createdAt: new Date('2026-01-01T00:05:00.000Z') },
      ]);

      const insights = await service.getMatchInsights(USER_ID);

      expect(insights.averageMessageInitiationSeconds).toBe(60);
    });

    it('excludes a match from the average when the user never sent a message in it', async () => {
      prisma.swipe.count.mockResolvedValue(2);
      prisma.match.findMany.mockResolvedValue([
        { id: MATCH_ID_1, createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: MATCH_ID_2, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      prisma.message.findMany.mockResolvedValue([
        { matchId: MATCH_ID_1, createdAt: new Date('2026-01-01T00:02:00.000Z') },
      ]);

      const insights = await service.getMatchInsights(USER_ID);

      expect(insights.averageMessageInitiationSeconds).toBe(120);
    });
  });
});
