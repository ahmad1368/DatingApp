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
    blockedContact: { findMany: jest.Mock };
  };
  let matchingService: { getCompatibility: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      swipe: { findMany: jest.fn() },
      dailyPick: { findMany: jest.fn(), createMany: jest.fn() },
      blockedContact: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('excludes a cached pick the user has already rated (liked or passed)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([
      { candidateId: 'candidate-1', compatibilityScore: 88 },
      { candidateId: 'candidate-2', compatibilityScore: 70 },
    ]);
    prisma.swipe.findMany
      .mockResolvedValueOnce([{ targetUserId: 'candidate-1' }]) // already rated
      .mockResolvedValueOnce([]); // recent likes received, for the standout flag
    prisma.user.findMany.mockResolvedValue([
      { id: 'candidate-2', name: 'Sam', dateOfBirth: null, profilePhotoUrl: null },
    ]);

    const picks = await service.getDailyPicks(USER_ID);

    expect(picks.map((p) => p.id)).toEqual(['candidate-2']);
  });

  it('returns an empty batch once every pick in the window has been rated', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([
      { candidateId: 'candidate-1', compatibilityScore: 88 },
    ]);
    prisma.swipe.findMany.mockResolvedValueOnce([{ targetUserId: 'candidate-1' }]);

    const picks = await service.getDailyPicks(USER_ID);

    expect(picks).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('flags a cached pick as a standout once it has enough recent likes', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([
      { candidateId: 'candidate-1', compatibilityScore: 88 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'candidate-1', name: 'Jane', dateOfBirth: null, profilePhotoUrl: null },
    ]);
    prisma.swipe.findMany
      .mockResolvedValueOnce([]) // this user's own swipes, for the already-rated filter
      .mockResolvedValueOnce([
        { targetUserId: 'candidate-1' },
        { targetUserId: 'candidate-1' },
        { targetUserId: 'candidate-1' },
      ]); // recent likes received, for the standout flag

    const picks = await service.getDailyPicks(USER_ID);

    expect(picks[0].isStandout).toBe(true);
  });

  it('generates and persists a ranked batch when no picks exist yet', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([]); // nothing cached yet
    prisma.swipe.findMany
      .mockResolvedValueOnce([{ targetUserId: 'already-swiped' }]) // own swipes -> excludedIds
      .mockResolvedValueOnce([]) // likersOfMe -> nobody has liked this user yet
      .mockResolvedValue([]); // engagement-count lookups -> no recent likes
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
        AND: [
          { OR: [{ incognitoEnabled: false }, { id: { in: [] } }] },
          { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
        ],
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

  it('excludes users blocked in either direction via synced contacts from the candidate pool', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([]);
    prisma.swipe.findMany.mockResolvedValue([]);
    prisma.blockedContact.findMany
      .mockResolvedValueOnce([{ blockedUserId: 'i-blocked-them' }])
      .mockResolvedValueOnce([{ userId: 'they-blocked-me' }]);
    prisma.user.findMany.mockResolvedValueOnce([]);

    await service.getDailyPicks(USER_ID);

    expect(prisma.user.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: { notIn: [USER_ID, 'i-blocked-them', 'they-blocked-me'] },
        onboardingCompletedAt: { not: null },
        AND: [
          { OR: [{ incognitoEnabled: false }, { id: { in: [] } }] },
          { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
        ],
      },
      take: 30,
      select: { id: true },
    });
  });

  it('lets an incognito candidate who already liked the viewer into the candidate pool', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.dailyPick.findMany.mockResolvedValueOnce([]);
    prisma.swipe.findMany
      .mockResolvedValueOnce([]) // own swipes -> nothing excluded
      .mockResolvedValueOnce([{ swiperId: 'incognito-liker' }]) // likersOfMe
      .mockResolvedValue([]); // engagement-count lookups
    prisma.user.findMany.mockResolvedValueOnce([]); // candidate pool (irrelevant to this assertion)

    await service.getDailyPicks(USER_ID);

    expect(prisma.user.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: { notIn: [USER_ID] },
        onboardingCompletedAt: { not: null },
        AND: [
          { OR: [{ incognitoEnabled: false }, { id: { in: ['incognito-liker'] } }] },
          { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
        ],
      },
      take: 30,
      select: { id: true },
    });
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
