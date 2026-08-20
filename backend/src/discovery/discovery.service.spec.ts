import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from './discovery.service';

const USER_ID = 'user-1';
const TARGET_ID = 'user-2';

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    swipe: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
    };
    match: { create: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
    boost: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      swipe: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
      match: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      boost: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new DiscoveryService(prisma as unknown as PrismaService);
  });

  const noFilters = {
    filterSmokingHabits: [],
    filterDrinkingHabits: [],
    filterEducationLevels: [],
    filterReligions: [],
    filterDietaryPreferences: [],
    filterWantsChildren: [],
    filterRelationshipGoals: [],
  };

  describe('getDeck', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getDeck(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('excludes self and already-swiped users, and computes age/distance', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: 0,
        longitude: 0,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
      });
      prisma.swipe.findMany
        .mockResolvedValueOnce([{ targetUserId: 'already-swiped' }]) // already swiped
        .mockResolvedValueOnce([]); // no super likers
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: new Date(new Date().getFullYear() - 25, 0, 1),
          profilePhotoUrl: 'https://example.com/photo.jpg',
          latitude: 0.1,
          longitude: 0,
          interests: ['Hiking'],
          relationshipGoal: 'CASUAL',
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID, 'already-swiped'] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          OR: [{ incognitoEnabled: false }, { id: { in: [] } }],
        },
        take: 20,
      });
      expect(deck).toHaveLength(1);
      expect(deck[0].id).toBe(TARGET_ID);
      expect(deck[0].age).toBe(25);
      expect(deck[0].distanceKm).toBeGreaterThan(0);
      expect(deck[0].isSuperLike).toBe(false);
    });

    it('applies the current user lifestyle filters to the candidate query', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        filterSmokingHabits: ['Never'],
        filterDrinkingHabits: [],
        filterEducationLevels: ['Bachelors', 'Masters'],
        filterReligions: [],
        filterDietaryPreferences: [],
        filterWantsChildren: [],
        filterRelationshipGoals: ['LONG_TERM'],
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          OR: [{ incognitoEnabled: false }, { id: { in: [] } }],
          smokingHabit: { in: ['Never'] },
          education: { in: ['Bachelors', 'Masters'] },
          relationshipGoal: { in: ['LONG_TERM'] },
        },
        take: 20,
      });
    });

    it('places super likers first and flags them as isSuperLike', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
      });
      prisma.swipe.findMany
        .mockResolvedValueOnce([]) // not swiped on anyone yet
        .mockResolvedValueOnce([{ swiperId: 'super-liker-1', action: 'SUPER_LIKE' }]); // received a super like
      prisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'super-liker-1', name: 'Sam', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        ]) // priority candidates
        .mockResolvedValueOnce([
          { id: 'other-user', name: 'Alex', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        ]); // remaining candidates

      const deck = await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['super-liker-1'] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
        },
        take: 20,
      });
      expect(prisma.user.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: { notIn: [USER_ID, 'super-liker-1'] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          OR: [{ incognitoEnabled: false }, { id: { in: ['super-liker-1'] } }],
        },
        take: 19,
      });
      expect(deck.map((card) => card.id)).toEqual(['super-liker-1', 'other-user']);
      expect(deck[0].isSuperLike).toBe(true);
      expect(deck[1].isSuperLike).toBe(false);
    });

    it('lets a plain (non-super) like bypass incognito filtering too', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
      });
      prisma.swipe.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ swiperId: 'liker-1', action: 'LIKE' }]);
      prisma.user.findMany.mockResolvedValueOnce([]); // no super likers -> no priority query result used

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          OR: [{ incognitoEnabled: false }, { id: { in: ['liker-1'] } }],
        },
        take: 20,
      });
    });

    it('places boosted users ahead of super likers and increments their view count', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
      });
      prisma.swipe.findMany
        .mockResolvedValueOnce([]) // not swiped on anyone yet
        .mockResolvedValueOnce([{ swiperId: 'super-liker-1', action: 'SUPER_LIKE' }]);
      prisma.boost.findMany.mockResolvedValueOnce([
        { userId: 'boosted-1', expiresAt: new Date(Date.now() + 60_000) },
      ]);
      prisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'boosted-1', name: 'Robin', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
          { id: 'super-liker-1', name: 'Sam', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        ]) // priority candidates (order not guaranteed from DB)
        .mockResolvedValueOnce([
          { id: 'other-user', name: 'Alex', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        ]); // remaining candidates

      const deck = await service.getDeck(USER_ID);

      expect(deck.map((card) => card.id)).toEqual(['boosted-1', 'super-liker-1', 'other-user']);
      expect(deck[0].isBoosted).toBe(true);
      expect(deck[0].isSuperLike).toBe(false);
      expect(deck[1].isBoosted).toBe(false);
      expect(deck[1].isSuperLike).toBe(true);
      expect(prisma.boost.updateMany).toHaveBeenCalledWith({
        where: { userId: { in: ['boosted-1'] }, expiresAt: { gt: expect.any(Date) } },
        data: { viewCount: { increment: 1 } },
      });
    });

    it('only surfaces candidates who share the current active mode', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'BFF',
        ...noFilters,
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID] },
          onboardingCompletedAt: { not: null },
          activeMode: 'BFF',
          OR: [{ incognitoEnabled: false }, { id: { in: [] } }],
        },
        take: 20,
      });
    });
  });

  describe('recordSwipe', () => {
    it('rejects swiping on yourself', async () => {
      await expect(service.recordSwipe(USER_ID, USER_ID, 'LIKE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.recordSwipe(USER_ID, TARGET_ID, 'LIKE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a duplicate swipe on the same target', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValue({ id: 'existing-swipe' });

      await expect(service.recordSwipe(USER_ID, TARGET_ID, 'LIKE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.swipe.create).not.toHaveBeenCalled();
    });

    it('records a PASS without checking for a match', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null); // no existing swipe
      prisma.swipe.create.mockResolvedValue({});

      const result = await service.recordSwipe(USER_ID, TARGET_ID, 'PASS');

      expect(result).toEqual({ matched: false });
      expect(prisma.match.create).not.toHaveBeenCalled();
    });

    it('creates a match when the target already liked the current user back', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique
        .mockResolvedValueOnce(null) // no existing swipe from userId -> targetUserId
        .mockResolvedValueOnce({ action: 'LIKE' }); // reciprocal swipe from targetUserId -> userId
      prisma.swipe.create.mockResolvedValue({});
      prisma.match.create.mockResolvedValue({ id: 'match-1' });

      const result = await service.recordSwipe(USER_ID, TARGET_ID, 'LIKE');

      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          userAId: [USER_ID, TARGET_ID].sort()[0],
          userBId: [USER_ID, TARGET_ID].sort()[1],
          firstMessageExpiresAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ matched: true, matchId: 'match-1' });
    });

    it('does not match when the reciprocal swipe was a PASS', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ action: 'PASS' });
      prisma.swipe.create.mockResolvedValue({});

      const result = await service.recordSwipe(USER_ID, TARGET_ID, 'LIKE');

      expect(result).toEqual({ matched: false });
      expect(prisma.match.create).not.toHaveBeenCalled();
    });

    it('rejects a super like once the daily limit is reached', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null);
      prisma.swipe.count.mockResolvedValue(1);

      await expect(service.recordSwipe(USER_ID, TARGET_ID, 'SUPER_LIKE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.swipe.create).not.toHaveBeenCalled();
    });

    it('allows a super like under the daily limit and matches against a plain LIKE', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ action: 'LIKE' });
      prisma.swipe.count.mockResolvedValue(0);
      prisma.swipe.create.mockResolvedValue({});
      prisma.match.create.mockResolvedValue({ id: 'match-1' });

      const result = await service.recordSwipe(USER_ID, TARGET_ID, 'SUPER_LIKE');

      expect(prisma.swipe.create).toHaveBeenCalledWith({
        data: { swiperId: USER_ID, targetUserId: TARGET_ID, action: 'SUPER_LIKE' },
      });
      expect(result).toEqual({ matched: true, matchId: 'match-1' });
    });
  });

  describe('undoLastSwipe', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.undoLastSwipe(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-premium users', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });

      await expect(service.undoLastSwipe(USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when there is no swipe to undo', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });
      prisma.swipe.findFirst.mockResolvedValue(null);

      await expect(service.undoLastSwipe(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes a plain swipe with no match', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-1',
        targetUserId: TARGET_ID,
        action: 'PASS',
      });
      prisma.match.findUnique.mockResolvedValue(null);
      prisma.swipe.delete.mockResolvedValue({});

      const result = await service.undoLastSwipe(USER_ID);

      expect(prisma.match.delete).not.toHaveBeenCalled();
      expect(prisma.swipe.delete).toHaveBeenCalledWith({ where: { id: 'swipe-1' } });
      expect(result).toEqual({ targetUserId: TARGET_ID, action: 'PASS', hadMatch: false });
    });

    it('also removes the match when the undone swipe formed one', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-1',
        targetUserId: TARGET_ID,
        action: 'LIKE',
      });
      prisma.match.findUnique.mockResolvedValue({ id: 'match-1', firstMessageSentAt: null });
      prisma.match.delete.mockResolvedValue({});
      prisma.swipe.delete.mockResolvedValue({});

      const result = await service.undoLastSwipe(USER_ID);

      expect(prisma.match.delete).toHaveBeenCalledWith({ where: { id: 'match-1' } });
      expect(result.hadMatch).toBe(true);
    });

    it('refuses to undo a match that already has a conversation', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-1',
        targetUserId: TARGET_ID,
        action: 'LIKE',
      });
      prisma.match.findUnique.mockResolvedValue({ id: 'match-1', firstMessageSentAt: new Date() });

      await expect(service.undoLastSwipe(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.match.delete).not.toHaveBeenCalled();
      expect(prisma.swipe.delete).not.toHaveBeenCalled();
    });
  });

  describe('setIncognitoMode', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setIncognitoMode(USER_ID, true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects enabling incognito for a non-premium user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });

      await expect(service.setIncognitoMode(USER_ID, true)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows a non-premium user to turn incognito off', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });
      prisma.user.update.mockResolvedValue({ incognitoEnabled: false });

      const result = await service.setIncognitoMode(USER_ID, false);

      expect(result).toEqual({ incognitoEnabled: false });
    });

    it('enables incognito for a premium user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });
      prisma.user.update.mockResolvedValue({ incognitoEnabled: true });

      const result = await service.setIncognitoMode(USER_ID, true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { incognitoEnabled: true },
      });
      expect(result).toEqual({ incognitoEnabled: true });
    });
  });

  describe('activateBoost', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.activateBoost(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-premium users', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });

      await expect(service.activateBoost(USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects activating a boost while one is already active', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });
      prisma.boost.findFirst.mockResolvedValue({ id: 'boost-1' });

      await expect(service.activateBoost(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.boost.create).not.toHaveBeenCalled();
    });

    it('creates a 30-minute boost for a premium user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });
      prisma.boost.findFirst.mockResolvedValue(null);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      prisma.boost.create.mockResolvedValue({ id: 'boost-1', expiresAt, viewCount: 0 });

      const result = await service.activateBoost(USER_ID);

      expect(prisma.boost.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, expiresAt: expect.any(Date) },
      });
      expect(result).toEqual({ active: true, expiresAt: expiresAt.toISOString(), viewCount: 0 });
    });
  });

  describe('getBoostStatus', () => {
    it('reports inactive when there is no current boost', async () => {
      prisma.boost.findFirst.mockResolvedValue(null);

      const result = await service.getBoostStatus(USER_ID);

      expect(result).toEqual({ active: false, expiresAt: null, viewCount: 0 });
    });

    it('reports the active boost with its view count', async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      prisma.boost.findFirst.mockResolvedValue({ id: 'boost-1', expiresAt, viewCount: 5 });

      const result = await service.getBoostStatus(USER_ID);

      expect(result).toEqual({ active: true, expiresAt: expiresAt.toISOString(), viewCount: 5 });
    });
  });

  describe('setActiveMode', () => {
    it('updates and returns the new active mode', async () => {
      prisma.user.update.mockResolvedValue({ activeMode: 'BIZZ' });

      const result = await service.setActiveMode(USER_ID, 'BIZZ');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { activeMode: 'BIZZ' },
      });
      expect(result).toEqual({ activeMode: 'BIZZ' });
    });
  });

  describe('getLikedByGrid', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getLikedByGrid(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the current user is not premium', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, isPremium: false });

      await expect(service.getLikedByGrid(USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns everyone who liked the user, most recent first, flagging super likes', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        isPremium: true,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
      });
      prisma.swipe.findMany
        .mockResolvedValueOnce([{ targetUserId: 'already-swiped' }]) // already swiped by me
        .mockResolvedValueOnce([
          { swiperId: 'liker-2', action: 'SUPER_LIKE' },
          { swiperId: 'liker-1', action: 'LIKE' },
        ]); // likers, most recent first
      prisma.user.findMany.mockResolvedValue([
        { id: 'liker-1', name: 'Alex', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        { id: 'liker-2', name: 'Sam', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
      ]);

      const grid = await service.getLikedByGrid(USER_ID);

      expect(prisma.swipe.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          targetUserId: USER_ID,
          action: { in: ['LIKE', 'SUPER_LIKE'] },
          swiperId: { notIn: [USER_ID, 'already-swiped'] },
        },
        select: { swiperId: true, action: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['liker-2', 'liker-1'] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
        },
      });
      expect(grid.map((card) => card.id)).toEqual(['liker-2', 'liker-1']);
      expect(grid[0].isSuperLike).toBe(true);
      expect(grid[0].isBoosted).toBe(false);
      expect(grid[1].isSuperLike).toBe(false);
    });

    it('returns an empty grid without querying users when nobody has liked the user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        isPremium: true,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const grid = await service.getLikedByGrid(USER_ID);

      expect(grid).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('applies the current active mode and lifestyle filters to the liker query', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        isPremium: true,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'BFF',
        filterSmokingHabits: ['Never'],
        filterDrinkingHabits: [],
        filterEducationLevels: [],
        filterReligions: [],
        filterDietaryPreferences: [],
        filterWantsChildren: [],
        filterRelationshipGoals: [],
      });
      prisma.swipe.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ swiperId: 'liker-1', action: 'LIKE' }]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getLikedByGrid(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['liker-1'] },
          onboardingCompletedAt: { not: null },
          activeMode: 'BFF',
          smokingHabit: { in: ['Never'] },
        },
      });
    });
  });
});
