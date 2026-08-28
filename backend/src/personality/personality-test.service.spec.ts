import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PersonalityTestService } from './personality-test.service';
import { PERSONALITY_TEST_ITEMS } from './personality-test.constants';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';

function fullValidResponses(overrides: Record<string, number> = {}) {
  return PERSONALITY_TEST_ITEMS.map((item) => ({
    itemId: item.id,
    score: overrides[item.id] ?? 3,
  }));
}

describe('PersonalityTestService', () => {
  let service: PersonalityTestService;
  let prisma: {
    personalityProfile: { upsert: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      personalityProfile: { upsert: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    service = new PersonalityTestService(prisma as unknown as PrismaService);
  });

  describe('getItems', () => {
    it('exposes all 32 dimensions without leaking the reverse-scoring flag', () => {
      const items = service.getItems();

      expect(items).toHaveLength(32);
      expect(items[0]).toEqual({
        id: PERSONALITY_TEST_ITEMS[0].id,
        dimension: PERSONALITY_TEST_ITEMS[0].dimension,
        statement: PERSONALITY_TEST_ITEMS[0].statement,
      });
    });
  });

  describe('submitTest', () => {
    it('rejects a response for an unknown item', async () => {
      const responses = [{ itemId: 'not-a-real-item', score: 3 }];

      await expect(service.submitTest(USER_ID, { responses })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.personalityProfile.upsert).not.toHaveBeenCalled();
    });

    it('rejects a duplicate response for the same item', async () => {
      const responses = [
        { itemId: PERSONALITY_TEST_ITEMS[0].id, score: 3 },
        { itemId: PERSONALITY_TEST_ITEMS[0].id, score: 4 },
      ];

      await expect(service.submitTest(USER_ID, { responses })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an incomplete submission', async () => {
      const responses = [{ itemId: PERSONALITY_TEST_ITEMS[0].id, score: 3 }];

      await expect(service.submitTest(USER_ID, { responses })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('scores a full submission, applying reverse-scoring where needed', async () => {
      const responses = fullValidResponses({
        'emotional-stability': 5, // not reverse-scored -> 5 * 20 = 100
        'resilience-under-stress': 5, // reverse-scored -> (6 - 5) * 20 = 20
      });
      prisma.personalityProfile.upsert.mockResolvedValue({
        dimensionScores: { 'Emotional Stability': 100, 'Resilience Under Stress': 20 },
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.submitTest(USER_ID, { responses });

      const upsertCall = prisma.personalityProfile.upsert.mock.calls[0][0];
      expect(upsertCall.where).toEqual({ userId: USER_ID });
      expect(upsertCall.create.dimensionScores['Emotional Stability']).toBe(100);
      expect(upsertCall.create.dimensionScores['Resilience Under Stress']).toBe(20);
      expect(upsertCall.create.dimensionScores['Optimism']).toBe(60); // neutral score 3 -> 60
    });
  });

  describe('getMyProfile', () => {
    it('throws when the user has not completed the test', async () => {
      prisma.personalityProfile.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the stored profile', async () => {
      prisma.personalityProfile.findUnique.mockResolvedValue({
        dimensionScores: { Optimism: 80 },
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.getMyProfile(USER_ID);

      expect(result).toEqual({
        dimensionScores: { Optimism: 80 },
        completedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getCompatibility', () => {
    it('rejects comparing a user with themselves', async () => {
      await expect(service.getCompatibility(USER_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns null when either user has not completed the test', async () => {
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({ dimensionScores: { Optimism: 80 } })
        .mockResolvedValueOnce(null);

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      expect(result).toEqual({ percentage: null, sharedDimensionCount: 0 });
    });

    it('computes similarity across shared dimensions', async () => {
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({ dimensionScores: { Optimism: 80, Warmth: 60 } })
        .mockResolvedValueOnce({ dimensionScores: { Optimism: 100, Warmth: 60 } });

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      // Optimism: 100 - |80-100| = 80; Warmth: 100 - |60-60| = 100; avg = 90
      expect(result).toEqual({ percentage: 90, sharedDimensionCount: 2 });
    });

    it('applies the viewing user\'s own category weights to the blended percentage', async () => {
      // Optimism and Warmth are both 'Emotional Values'; Directness is 'Communication Style'.
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({
          dimensionScores: { Optimism: 80, Warmth: 60, Directness: 40 },
        })
        .mockResolvedValueOnce({
          dimensionScores: { Optimism: 100, Warmth: 60, Directness: 100 },
        });
      prisma.user.findUnique.mockResolvedValue({
        compatibilityCategoryWeights: { 'Emotional Values': 2, 'Communication Style': 0 },
      });

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      // Emotional Values similarities: Optimism 80, Warmth 100 -> weighted 2x each;
      // Communication Style (Directness, similarity 40) weighted 0x, so it drops out entirely.
      // (80*2 + 100*2) / (2+2) = 90
      expect(result.percentage).toBe(90);
    });
  });

  describe('getCompatibilityBreakdown', () => {
    it('rejects comparing a user with themselves', async () => {
      await expect(
        service.getCompatibilityBreakdown(USER_ID, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns an empty breakdown when either user has not completed the test', async () => {
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({ dimensionScores: { Optimism: 80 } })
        .mockResolvedValueOnce(null);

      const result = await service.getCompatibilityBreakdown(USER_ID, OTHER_ID);

      expect(result).toEqual({ percentage: null, sharedDimensionCount: 0, categories: [] });
    });

    it('groups shared dimensions by category with per-dimension scores', async () => {
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({
          dimensionScores: { Optimism: 80, Warmth: 60, Directness: 40 },
        })
        .mockResolvedValueOnce({
          dimensionScores: { Optimism: 100, Warmth: 60, Directness: 100 },
        });

      const result = await service.getCompatibilityBreakdown(USER_ID, OTHER_ID);

      expect(result.sharedDimensionCount).toBe(3);
      // Optimism 80, Warmth 100 -> avg 90 for Emotional Values; Directness 40 alone for Communication Style
      const emotionalValues = result.categories.find((c) => c.category === 'Emotional Values');
      const communicationStyle = result.categories.find(
        (c) => c.category === 'Communication Style',
      );
      expect(emotionalValues).toEqual({
        category: 'Emotional Values',
        averageSimilarity: 90,
        dimensions: [
          { dimension: 'Optimism', myScore: 80, theirScore: 100, similarity: 80 },
          { dimension: 'Warmth', myScore: 60, theirScore: 60, similarity: 100 },
        ],
      });
      expect(communicationStyle).toEqual({
        category: 'Communication Style',
        averageSimilarity: 40,
        dimensions: [{ dimension: 'Directness', myScore: 40, theirScore: 100, similarity: 40 }],
      });
    });
  });

  describe('getCompatibilityReport', () => {
    it('rejects comparing a user with themselves', async () => {
      await expect(service.getCompatibilityReport(USER_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns an empty report when either user has not completed the test', async () => {
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({ dimensionScores: { Optimism: 80 } })
        .mockResolvedValueOnce(null);

      const result = await service.getCompatibilityReport(USER_ID, OTHER_ID);

      expect(result).toEqual({ percentage: null, sharedDimensionCount: 0, sections: [] });
    });

    it('builds sections for communication, conflict resolution, and emotional compatibility', async () => {
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({
          dimensionScores: { Optimism: 80, Directness: 40, 'Conflict Resolution Style': 90 },
        })
        .mockResolvedValueOnce({
          dimensionScores: { Optimism: 100, Directness: 100, 'Conflict Resolution Style': 90 },
        });

      const result = await service.getCompatibilityReport(USER_ID, OTHER_ID);

      const communication = result.sections.find((s) => s.title === 'Communication Strengths');
      const conflict = result.sections.find((s) => s.title === 'Conflict Resolution Style');
      const emotional = result.sections.find((s) => s.title === 'Emotional Compatibility');

      // Communication Strengths includes every Communication Style dimension,
      // Conflict Resolution Style included: Directness (sim 40) + Conflict
      // Resolution Style (sim 100) -> avg 70.
      expect(communication).toEqual({
        title: 'Communication Strengths',
        score: 70,
        insight: 'Generally compatible, with some differences worth navigating.',
        dimensions: [
          { dimension: 'Directness', myScore: 40, theirScore: 100, similarity: 40 },
          { dimension: 'Conflict Resolution Style', myScore: 90, theirScore: 90, similarity: 100 },
        ],
      });
      // Conflict Resolution Style 90 vs 90 -> similarity 100
      expect(conflict).toEqual({
        title: 'Conflict Resolution Style',
        score: 100,
        insight: 'Strongly aligned - this is likely to feel effortless together.',
        dimensions: [
          { dimension: 'Conflict Resolution Style', myScore: 90, theirScore: 90, similarity: 100 },
        ],
      });
      // Optimism 80 vs 100 -> similarity 80
      expect(emotional).toEqual({
        title: 'Emotional Compatibility',
        score: 80,
        insight: 'Generally compatible, with some differences worth navigating.',
        dimensions: [{ dimension: 'Optimism', myScore: 80, theirScore: 100, similarity: 80 }],
      });
    });

    it('omits a section entirely when there is no shared data for it', async () => {
      prisma.personalityProfile.findUnique
        .mockResolvedValueOnce({ dimensionScores: { Optimism: 80 } })
        .mockResolvedValueOnce({ dimensionScores: { Optimism: 100 } });

      const result = await service.getCompatibilityReport(USER_ID, OTHER_ID);

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe('Emotional Compatibility');
    });
  });

  describe('getCategoryWeights', () => {
    it('defaults every category to weight 1 when nothing is stored', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getCategoryWeights(USER_ID);

      expect(result).toEqual({
        'Emotional Values': 1,
        'Core Values': 1,
        'Communication Style': 1,
        'Social Habits': 1,
      });
    });

    it('fills in the default for any category missing from the stored weights', async () => {
      prisma.user.findUnique.mockResolvedValue({
        compatibilityCategoryWeights: { 'Core Values': 1.5 },
      });

      const result = await service.getCategoryWeights(USER_ID);

      expect(result['Core Values']).toBe(1.5);
      expect(result['Social Habits']).toBe(1);
    });
  });

  describe('setCategoryWeights', () => {
    it('rejects an unknown category', async () => {
      await expect(
        service.setCategoryWeights(USER_ID, { 'Not A Real Category': 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a weight outside the 0-2 range', async () => {
      await expect(
        service.setCategoryWeights(USER_ID, { 'Core Values': 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('persists the weights and returns the normalized set', async () => {
      prisma.user.update.mockResolvedValue({
        compatibilityCategoryWeights: { 'Core Values': 2, 'Social Habits': 0 },
      });

      const result = await service.setCategoryWeights(USER_ID, {
        'Core Values': 2,
        'Social Habits': 0,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { compatibilityCategoryWeights: { 'Core Values': 2, 'Social Habits': 0 } },
      });
      expect(result).toEqual({
        'Emotional Values': 1,
        'Core Values': 2,
        'Communication Style': 1,
        'Social Habits': 0,
      });
    });
  });
});
