import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { CuratedProfilesService } from './curated-profiles.service';

const USER_ID = 'user-1';

describe('CuratedProfilesService', () => {
  let service: CuratedProfilesService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    swipe: { findMany: jest.Mock };
    dailyPick: { findMany: jest.Mock; createMany: jest.Mock };
  };
  let matchingService: { getCompatibility: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      swipe: { findMany: jest.fn() },
      dailyPick: { findMany: jest.fn(), createMany: jest.fn() },
    };
    matchingService = { getCompatibility: jest.fn() };
    service = new CuratedProfilesService(
      prisma as unknown as PrismaService,
      matchingService as unknown as MatchingService,
    );
  });

  it('throws when the current user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getDailyPicks(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns already-generated picks for the current window without regenerating', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([
      { candidateId: 'candidate-1', compatibilityScore: 88 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'candidate-1',
        name: 'Jane',
        dateOfBirth: new Date(new Date().getFullYear() - 30, 0, 1),
        profilePhotoUrl: 'https://example.com/jane.jpg',
      },
    ]);
    prisma.swipe.findMany.mockResolvedValue([]); // no recent likes -> not a standout

    const picks = await service.getDailyPicks(USER_ID);

    expect(matchingService.getCompatibility).not.toHaveBeenCalled();
    expect(picks).toEqual([
      {
        id: 'candidate-1',
        name: 'Jane',
        age: 30,
        profilePhotoUrl: 'https://example.com/jane.jpg',
        compatibilityPercentage: 88,
        isStandout: false,
      },
    ]);
  });

  it('flags a cached pick as a standout once it has enough recent likes', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([
      { candidateId: 'candidate-1', compatibilityScore: 88 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'candidate-1', name: 'Jane', dateOfBirth: null, profilePhotoUrl: null },
    ]);
    prisma.swipe.findMany.mockResolvedValue([
      { targetUserId: 'candidate-1' },
      { targetUserId: 'candidate-1' },
      { targetUserId: 'candidate-1' },
    ]);

    const picks = await service.getDailyPicks(USER_ID);

    expect(picks[0].isStandout).toBe(true);
  });

  it('generates and persists a ranked batch when no picks exist yet', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([]); // nothing cached yet
    prisma.swipe.findMany.mockResolvedValue([{ targetUserId: 'already-swiped' }]);
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'low-compat' }, { id: 'high-compat' }]) // candidate pool
      .mockResolvedValueOnce([
        { id: 'high-compat', name: 'Alex', dateOfBirth: null, profilePhotoUrl: null },
        { id: 'low-compat', name: 'Sam', dateOfBirth: null, profilePhotoUrl: null },
      ]); // hydration of the chosen picks
    matchingService.getCompatibility.mockImplementation((_userId: string, candidateId: string) =>
      Promise.resolve({
        percentage: candidateId === 'high-compat' ? 95 : 40,
        sharedQuestionCount: 3,
      }),
    );

    const picks = await service.getDailyPicks(USER_ID);

    expect(prisma.user.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: { notIn: [USER_ID, 'already-swiped'] },
        onboardingCompletedAt: { not: null },
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
      },
      take: 30,
      select: { id: true },
    });
    expect(prisma.dailyPick.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER_ID,
          candidateId: 'high-compat',
          windowStart: expect.any(Date),
          compatibilityScore: 95,
        },
        {
          userId: USER_ID,
          candidateId: 'low-compat',
          windowStart: expect.any(Date),
          compatibilityScore: 40,
        },
      ],
      skipDuplicates: true,
    });
    expect(picks.map((p) => p.id)).toEqual(['high-compat', 'low-compat']);
    expect(picks[0].compatibilityPercentage).toBe(95);
  });

  it('gives highly-liked candidates an engagement bonus that can move them ahead in ranking', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([]); // nothing cached yet
    prisma.swipe.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.swiperId) {
        return Promise.resolve([]); // nobody swiped on yet
      }
      // Recent-likes lookup: 'popular' has received several likes, 'quiet' none.
      return Promise.resolve([
        { targetUserId: 'popular' },
        { targetUserId: 'popular' },
        { targetUserId: 'popular' },
      ]);
    });
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'quiet' }, { id: 'popular' }]) // candidate pool
      .mockResolvedValueOnce([
        { id: 'popular', name: 'Robin', dateOfBirth: null, profilePhotoUrl: null },
        { id: 'quiet', name: 'Sam', dateOfBirth: null, profilePhotoUrl: null },
      ]); // hydration of the chosen picks
    matchingService.getCompatibility.mockImplementation((_userId: string, candidateId: string) =>
      Promise.resolve({ percentage: candidateId === 'quiet' ? 60 : 55, sharedQuestionCount: 3 }),
    );

    const picks = await service.getDailyPicks(USER_ID);

    expect(picks.map((p) => p.id)).toEqual(['popular', 'quiet']);
    expect(picks[0].isStandout).toBe(true);
    expect(picks[1].isStandout).toBe(false);
  });

  it('returns an empty batch without scoring when there are no eligible candidates', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([]);
    prisma.swipe.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValueOnce([]);

    const picks = await service.getDailyPicks(USER_ID);

    expect(matchingService.getCompatibility).not.toHaveBeenCalled();
    expect(prisma.dailyPick.createMany).not.toHaveBeenCalled();
    expect(picks).toEqual([]);
  });
});
