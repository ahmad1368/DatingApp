import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DiscoveryService } from './discovery.service';

const USER_ID = 'user-1';
const TARGET_ID = 'user-2';

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let matchingService: { getCompatibility: jest.Mock };
  let notificationsService: { notify: jest.Mock };
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
    blockedContact: { findMany: jest.Mock };
    socialContact: { findMany: jest.Mock };
    profilePhoto: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    message: { create: jest.Mock };
    icebreakerResponse: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      swipe: {
        findMany: jest.fn().mockResolvedValue([]),
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
      blockedContact: { findMany: jest.fn().mockResolvedValue([]) },
      socialContact: { findMany: jest.fn().mockResolvedValue([]) },
      profilePhoto: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      message: { create: jest.fn() },
      icebreakerResponse: { createMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    matchingService = { getCompatibility: jest.fn() };
    notificationsService = { notify: jest.fn() };
    service = new DiscoveryService(
      prisma as unknown as PrismaService,
      matchingService as unknown as MatchingService,
      notificationsService as unknown as NotificationsService,
    );
  });

  const noFilters = {
    filterSmokingHabits: [],
    filterDrinkingHabits: [],
    filterEducationLevels: [],
    filterReligions: [],
    filterDietaryPreferences: [],
    filterWantsChildren: [],
    filterRelationshipGoals: [],
    filterKinkTags: [],
    filterRelationshipDesires: [],
    filterSharedInterestsOnly: false,
    interests: [],
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
          videoSnippetUrl: 'https://example.com/snippet.mp4',
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
          AND: [
            { OR: [{ incognitoEnabled: false }, { id: { in: [] } }] },
            { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
          ],
        },
        take: 60,
      });
      expect(deck).toHaveLength(1);
      expect(deck[0].id).toBe(TARGET_ID);
      expect(deck[0].age).toBe(25);
      expect(deck[0].distanceKm).toBeGreaterThan(0);
      expect(deck[0].isSuperLike).toBe(false);
      expect(deck[0].relationshipIntentBadges).toEqual([]);
      expect(deck[0].videoSnippetUrl).toBe('https://example.com/snippet.mp4');
    });

    it('includes each candidate mutual connection count from synced contacts', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
        },
      ]);
      prisma.socialContact.findMany
        .mockResolvedValueOnce([{ contactValue: 'shared@example.com' }])
        .mockResolvedValueOnce([{ userId: TARGET_ID }, { userId: TARGET_ID }]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].mutualConnectionCount).toBe(2);
    });

    it('defaults mutual connection count to zero when the viewer has no synced contacts', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].mutualConnectionCount).toBe(0);
    });

    it('shows relationship intent badges only when their visibility toggles are on', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          relationshipDesires: ['Marriage', 'Long-Term Relationship'],
          showRelationshipDesiresOnProfile: true,
          customRelationshipIntent: 'Open to relocating',
          showCustomRelationshipIntentOnProfile: false,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].relationshipIntentBadges).toEqual(['Marriage', 'Long-Term Relationship']);
    });

    it('builds lifestyle badges only when the candidate opts in to showing them', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          heightCm: 178,
          workoutHabit: 'Often',
          petOwnership: 'Dog',
          smokingHabit: 'Never',
          drinkingHabit: 'Socially',
          showLifestyleBadgesOnProfile: true,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].lifestyleBadges).toEqual([
        '178 cm',
        'Workout: Often',
        'Dog',
        'Smoking: Never',
        'Drinking: Socially',
      ]);
    });

    it('hides lifestyle badges when the candidate has opted out', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          heightCm: 178,
          workoutHabit: 'Often',
          petOwnership: 'Dog',
          smokingHabit: 'Never',
          drinkingHabit: 'Socially',
          showLifestyleBadgesOnProfile: false,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].lifestyleBadges).toEqual([]);
    });

    it('shows communication boundaries only when the candidate opts in', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          communicationBoundaries: 'Texting only until we meet',
          showCommunicationBoundariesOnProfile: true,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].communicationBoundaries).toBe('Texting only until we meet');
    });

    it('hides communication boundaries when the candidate has opted out', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          communicationBoundaries: 'Texting only until we meet',
          showCommunicationBoundariesOnProfile: false,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].communicationBoundaries).toBeNull();
    });

    it('includes the candidate voice intro url and duration when they have one', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          voiceIntroUrl: 'https://example.com/intro.m4a',
          voiceIntroDurationSeconds: 18,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].voiceIntroUrl).toBe('https://example.com/intro.m4a');
      expect(deck[0].voiceIntroDurationSeconds).toBe(18);
    });

    it('flags the profile photo as blurred when the candidate has opted into incognito blur', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: 'https://example.com/jane.jpg',
          interests: [],
          relationshipGoal: 'CASUAL',
          blurPhotosUntilMatch: true,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].profilePhotoBlurred).toBe(true);
    });

    it('does not flag the profile photo as blurred by default', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: 'https://example.com/jane.jpg',
          interests: [],
          relationshipGoal: 'CASUAL',
          blurPhotosUntilMatch: false,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].profilePhotoBlurred).toBe(false);
    });

    it('shows the zodiac sign only when the candidate opts in and has a date of birth', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: new Date(Date.UTC(1995, 6, 25)),
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          showZodiacOnProfile: true,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].zodiacSign).toBe('Leo');
    });

    it('hides the zodiac sign when the candidate has opted out', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: new Date(Date.UTC(1995, 6, 25)),
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          showZodiacOnProfile: false,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].zodiacSign).toBeNull();
    });

    it('builds love style badges respecting each toggle independently', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: 'CASUAL',
          loveLanguages: ['Physical Touch', 'Time Together'],
          showLoveLanguagesOnProfile: true,
          attachmentStyle: 'Secure',
          showAttachmentStyleOnProfile: false,
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].loveStyleBadges).toEqual(['Physical Touch', 'Time Together']);
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
          AND: [
            { OR: [{ incognitoEnabled: false }, { id: { in: [] } }] },
            { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
          ],
          smokingHabit: { in: ['Never'] },
          education: { in: ['Bachelors', 'Masters'] },
          relationshipGoal: { in: ['LONG_TERM'] },
        },
        take: 60,
      });
    });

    it('applies kink tag and relationship desire filters to the candidate query', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
        filterKinkTags: ['BDSM', 'Roleplay'],
        filterRelationshipDesires: ['Long-Term Relationship'],
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          AND: [
            { OR: [{ incognitoEnabled: false }, { id: { in: [] } }] },
            { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
          ],
          kinkTags: { hasSome: ['BDSM', 'Roleplay'] },
          relationshipDesires: { hasSome: ['Long-Term Relationship'] },
        },
        take: 60,
      });
    });

    it('filters the deck to shared-interest candidates only when opted in', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
        filterSharedInterestsOnly: true,
        interests: ['Hiking', 'Cooking'],
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ interests: { hasSome: ['Hiking', 'Cooking'] } }),
        }),
      );
    });

    it('does not filter by interests when the toggle is off', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
        interests: ['Hiking', 'Cooking'],
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.interests).toBeUndefined();
    });

    it('filters the deck to verified candidates only when opted in', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
        filterVerifiedOnly: true,
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isVerified: true }),
        }),
      );
    });

    it('does not filter by verification when the toggle is off', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.isVerified).toBeUndefined();
    });

    it('filters the deck to shared community groups when set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
        filterCommunityGroups: ['book-lovers', 'foodies'],
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            communityGroupIds: { hasSome: ['book-lovers', 'foodies'] },
          }),
        }),
      );
    });

    it('does not filter by community group when none are selected', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.communityGroupIds).toBeUndefined();
    });

    it('highlights which of a candidate\'s interests overlap with the viewer\'s own', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
        interests: ['Hiking', 'Cooking'],
      });
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: TARGET_ID,
          name: 'Jane',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: ['Hiking', 'Gaming', 'Photography'],
          relationshipGoal: 'CASUAL',
        },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck[0].interests).toEqual(['Hiking', 'Gaming', 'Photography']);
      expect(deck[0].sharedInterests).toEqual(['Hiking']);
    });

    it('ranks the remaining candidate pool closer-first when no one has recent engagement', async () => {
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
        .mockResolvedValueOnce([]) // not swiped on anyone yet
        .mockResolvedValueOnce([]) // no likers
        .mockResolvedValueOnce([]); // no recent right-swipes on anyone
      prisma.user.findMany.mockResolvedValue([
        { id: 'far-away', name: 'Far', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null, latitude: 10, longitude: 10 },
        { id: 'nearby', name: 'Near', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null, latitude: 0.01, longitude: 0 },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck.map((card) => card.id)).toEqual(['nearby', 'far-away']);
    });

    it('lets a recent right-swipe trend outweigh a small proximity gap', async () => {
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
        .mockResolvedValueOnce([]) // not swiped on anyone yet
        .mockResolvedValueOnce([]) // no likers
        .mockResolvedValueOnce(
          Array.from({ length: 10 }, () => ({ targetUserId: 'trending' })),
        ); // enough recent right-swipes to hit the trending bonus cap
      prisma.user.findMany.mockResolvedValue([
        { id: 'nearby', name: 'Near', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null, latitude: 0.1, longitude: 0 },
        { id: 'trending', name: 'Trending', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null, latitude: 0.5, longitude: 0 },
      ]);

      const deck = await service.getDeck(USER_ID);

      expect(deck.map((card) => card.id)).toEqual(['trending', 'nearby']);
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
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
        },
        take: 20,
      });
      expect(prisma.user.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: { notIn: [USER_ID, 'super-liker-1'] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          AND: [
            { OR: [{ incognitoEnabled: false }, { id: { in: ['super-liker-1'] } }] },
            { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
          ],
        },
        take: 60,
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
      prisma.user.findMany
        .mockResolvedValueOnce([]) // liker-1 is not premium -> no priority likes either
        .mockResolvedValueOnce([]); // remaining pool

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          AND: [
            { OR: [{ incognitoEnabled: false }, { id: { in: ['liker-1'] } }] },
            { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
          ],
        },
        take: 60,
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
        where: { userId: 'boosted-1', expiresAt: { gt: expect.any(Date) } },
        data: { viewCount: { increment: 1 } },
      });
    });

    it('places a premium user\'s plain like between super likers and the remaining pool', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { swiperId: 'super-liker-1', action: 'SUPER_LIKE' },
        { swiperId: 'premium-liker-1', action: 'LIKE' },
        { swiperId: 'free-liker-1', action: 'LIKE' },
      ]);
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 'premium-liker-1' }]) // only premium-liker-1 is premium
        .mockResolvedValueOnce([
          { id: 'super-liker-1', name: 'Sam', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
          { id: 'premium-liker-1', name: 'Priya', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        ]) // priority candidates
        .mockResolvedValueOnce([
          { id: 'free-liker-1', name: 'Fran', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        ]); // remaining candidates

      const deck = await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenNthCalledWith(1, {
        where: { id: { in: ['premium-liker-1', 'free-liker-1'] }, isPremium: true },
        select: { id: true },
      });
      expect(deck.map((card) => card.id)).toEqual(['super-liker-1', 'premium-liker-1', 'free-liker-1']);
      expect(deck[0].isSuperLike).toBe(true);
      expect(deck[0].isPriorityLike).toBe(false);
      expect(deck[1].isSuperLike).toBe(false);
      expect(deck[1].isPriorityLike).toBe(true);
      expect(deck[2].isPriorityLike).toBe(false);
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
          AND: [
            { OR: [{ incognitoEnabled: false }, { id: { in: [] } }] },
            { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
          ],
        },
        take: 60,
      });
    });

    it('excludes snoozed candidates from both the priority and remaining pools', async () => {
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
        .mockResolvedValueOnce([{ swiperId: 'super-liker-1', action: 'SUPER_LIKE' }]);
      prisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.getDeck(USER_ID);

      const priorityWhere = prisma.user.findMany.mock.calls[0][0].where;
      const remainingWhere = prisma.user.findMany.mock.calls[1][0].where;

      expect(priorityWhere.OR).toEqual([{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }]);
      expect(remainingWhere.AND).toContainEqual({
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
      });
    });

    it('excludes users blocked in either direction via synced contacts', async () => {
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
      prisma.swipe.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.blockedContact.findMany
        .mockResolvedValueOnce([{ blockedUserId: 'i-blocked-them' }])
        .mockResolvedValueOnce([{ userId: 'they-blocked-me' }]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDeck(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID, 'i-blocked-them', 'they-blocked-me'] },
          onboardingCompletedAt: { not: null },
          activeMode: 'DATING',
          AND: [
            { OR: [{ incognitoEnabled: false }, { id: { in: [] } }] },
            { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }] },
          ],
        },
        take: 60,
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

    it('rejects attaching a compliment to a PASS', async () => {
      await expect(
        service.recordSwipe(USER_ID, TARGET_ID, 'PASS', 'Nice smile!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.swipe.create).not.toHaveBeenCalled();
    });

    it('rejects attaching a pass reason to a LIKE', async () => {
      await expect(
        service.recordSwipe(
          USER_ID,
          TARGET_ID,
          'LIKE',
          undefined,
          undefined,
          undefined,
          undefined,
          'Not my type',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.swipe.create).not.toHaveBeenCalled();
    });

    it('stores an optional pass reason attached to a PASS', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null);
      prisma.swipe.create.mockResolvedValue({});

      const result = await service.recordSwipe(
        USER_ID,
        TARGET_ID,
        'PASS',
        undefined,
        undefined,
        undefined,
        undefined,
        'Too far away',
      );

      expect(prisma.swipe.create).toHaveBeenCalledWith({
        data: {
          swiperId: USER_ID,
          targetUserId: TARGET_ID,
          action: 'PASS',
          complimentText: null,
          complimentTarget: null,
          icebreakerPromptId: null,
          icebreakerOptionIndex: null,
          passReason: 'Too far away',
        },
      });
      expect(result).toEqual({ matched: false });
    });

    it('getPassReasons exposes the quick-pick catalog', () => {
      expect(service.getPassReasons()).toEqual([
        'Not my type',
        'Too far away',
        'Not enough info',
        'Inappropriate profile',
        'Just not feeling it',
      ]);
    });

    it('stores a compliment attached to a like', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.swipe.create.mockResolvedValue({});

      await service.recordSwipe(
        USER_ID,
        TARGET_ID,
        'LIKE',
        'Love your hiking photo!',
        'your hiking photo',
      );

      expect(prisma.swipe.create).toHaveBeenCalledWith({
        data: {
          swiperId: USER_ID,
          targetUserId: TARGET_ID,
          action: 'LIKE',
          complimentText: 'Love your hiking photo!',
          complimentTarget: 'your hiking photo',
          icebreakerPromptId: null,
          icebreakerOptionIndex: null,
          passReason: null,
        },
      });
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
      expect(notificationsService.notify).toHaveBeenCalledWith(
        USER_ID,
        'NEW_MATCH',
        "It's a match!",
        'You have a new match.',
        { matchId: 'match-1' },
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        TARGET_ID,
        'NEW_MATCH',
        "It's a match!",
        'You have a new match.',
        { matchId: 'match-1' },
      );
      expect(result).toEqual({ matched: true, matchId: 'match-1' });
    });

    it('rejects icebreakerPromptId without a matching icebreakerOptionIndex', async () => {
      await expect(
        service.recordSwipe(USER_ID, TARGET_ID, 'LIKE', undefined, undefined, 'coffee-or-tea'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an icebreaker attached to a PASS', async () => {
      await expect(
        service.recordSwipe(USER_ID, TARGET_ID, 'PASS', undefined, undefined, 'coffee-or-tea', 0),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown icebreaker prompt id', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });

      await expect(
        service.recordSwipe(USER_ID, TARGET_ID, 'LIKE', undefined, undefined, 'not-a-real-prompt', 0),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('seeds the new match with both answers when both sides picked the same icebreaker', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique
        .mockResolvedValueOnce(null) // no existing swipe from userId -> targetUserId
        .mockResolvedValueOnce({
          swiperId: TARGET_ID,
          action: 'LIKE',
          icebreakerPromptId: 'coffee-or-tea',
          icebreakerOptionIndex: 1,
        });
      prisma.swipe.create.mockResolvedValue({});
      prisma.match.create.mockResolvedValue({ id: 'match-1' });
      prisma.message.create.mockResolvedValue({ id: 'message-1' });

      await service.recordSwipe(USER_ID, TARGET_ID, 'LIKE', undefined, undefined, 'coffee-or-tea', 0);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { matchId: 'match-1', senderId: USER_ID, contentType: 'ICEBREAKER', content: 'coffee-or-tea' },
      });
      expect(prisma.icebreakerResponse.createMany).toHaveBeenCalledWith({
        data: [
          { messageId: 'message-1', userId: USER_ID, optionIndex: 0 },
          { messageId: 'message-1', userId: TARGET_ID, optionIndex: 1 },
        ],
      });
    });

    it('seeds only the liker side when the other side never answered an icebreaker', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          swiperId: TARGET_ID,
          action: 'LIKE',
          icebreakerPromptId: null,
          icebreakerOptionIndex: null,
        });
      prisma.swipe.create.mockResolvedValue({});
      prisma.match.create.mockResolvedValue({ id: 'match-1' });
      prisma.message.create.mockResolvedValue({ id: 'message-1' });

      await service.recordSwipe(USER_ID, TARGET_ID, 'LIKE', undefined, undefined, 'coffee-or-tea', 0);

      expect(prisma.icebreakerResponse.createMany).toHaveBeenCalledWith({
        data: [{ messageId: 'message-1', userId: USER_ID, optionIndex: 0 }],
      });
    });

    it('does not seed an icebreaker message when neither side attached one', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          swiperId: TARGET_ID,
          action: 'LIKE',
          icebreakerPromptId: null,
          icebreakerOptionIndex: null,
        });
      prisma.swipe.create.mockResolvedValue({});
      prisma.match.create.mockResolvedValue({ id: 'match-1' });

      await service.recordSwipe(USER_ID, TARGET_ID, 'LIKE');

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(prisma.icebreakerResponse.createMany).not.toHaveBeenCalled();
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

    it('rejects a super like once the daily limit is reached and no bonus super likes remain', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: TARGET_ID }) // target lookup
        .mockResolvedValueOnce({ bonusSuperLikes: 0 }); // swiper's bonus balance
      prisma.swipe.findUnique.mockResolvedValueOnce(null);
      prisma.swipe.count.mockResolvedValue(1);

      await expect(service.recordSwipe(USER_ID, TARGET_ID, 'SUPER_LIKE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.swipe.create).not.toHaveBeenCalled();
    });

    it('allows a super like beyond the daily limit by spending a bonus super like', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: TARGET_ID }) // target lookup
        .mockResolvedValueOnce({ bonusSuperLikes: 2 }); // swiper's bonus balance
      prisma.swipe.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.swipe.count.mockResolvedValue(1);
      prisma.swipe.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      const result = await service.recordSwipe(USER_ID, TARGET_ID, 'SUPER_LIKE');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { bonusSuperLikes: { decrement: 1 } },
      });
      expect(result).toEqual({ matched: false });
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
        data: {
          swiperId: USER_ID,
          targetUserId: TARGET_ID,
          action: 'SUPER_LIKE',
          complimentText: null,
          complimentTarget: null,
          icebreakerPromptId: null,
          icebreakerOptionIndex: null,
          passReason: null,
        },
      });
      expect(result).toEqual({ matched: true, matchId: 'match-1' });
    });

    it('does nothing to photos when the target has no gallery', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null);
      prisma.swipe.create.mockResolvedValue({});
      prisma.profilePhoto.findFirst.mockResolvedValue(null);

      await service.recordSwipe(USER_ID, TARGET_ID, 'LIKE');

      expect(prisma.profilePhoto.update).not.toHaveBeenCalled();
      expect(prisma.profilePhoto.findMany).not.toHaveBeenCalled();
    });

    it('records an impression and right-swipe against the lead photo', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null);
      prisma.swipe.create.mockResolvedValue({});
      prisma.profilePhoto.findFirst.mockResolvedValue({ id: 'photo-1', position: 0 });
      prisma.profilePhoto.findMany.mockResolvedValue([{ id: 'photo-1', position: 0, impressions: 1, rightSwipes: 1 }]);

      await service.recordSwipe(USER_ID, TARGET_ID, 'LIKE');

      expect(prisma.profilePhoto.update).toHaveBeenCalledWith({
        where: { id: 'photo-1' },
        data: { impressions: { increment: 1 }, rightSwipes: { increment: 1 } },
      });
    });

    it('rotates the lead photo once a better-converting photo clears the sample-size threshold', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null);
      prisma.swipe.create.mockResolvedValue({});
      prisma.profilePhoto.findFirst.mockResolvedValue({ id: 'lead', position: 0 });
      prisma.profilePhoto.findMany.mockResolvedValue([
        { id: 'lead', mediaUrl: 'https://example.com/lead.jpg', position: 0, impressions: 10, rightSwipes: 1 },
        { id: 'challenger', mediaUrl: 'https://example.com/challenger.jpg', position: 1, impressions: 8, rightSwipes: 6 },
      ]);

      await service.recordSwipe(USER_ID, TARGET_ID, 'PASS');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.profilePhoto.update).toHaveBeenCalledWith({ where: { id: 'lead' }, data: { position: 1 } });
      expect(prisma.profilePhoto.update).toHaveBeenCalledWith({
        where: { id: 'challenger' },
        data: { position: 0 },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: TARGET_ID },
        data: { profilePhotoUrl: 'https://example.com/challenger.jpg' },
      });
    });

    it('does not rotate when no photo has cleared the minimum sample size', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });
      prisma.swipe.findUnique.mockResolvedValueOnce(null);
      prisma.swipe.create.mockResolvedValue({});
      prisma.profilePhoto.findFirst.mockResolvedValue({ id: 'lead', position: 0 });
      prisma.profilePhoto.findMany.mockResolvedValue([
        { id: 'lead', mediaUrl: 'https://example.com/lead.jpg', position: 0, impressions: 2, rightSwipes: 0 },
        { id: 'challenger', mediaUrl: 'https://example.com/challenger.jpg', position: 1, impressions: 1, rightSwipes: 1 },
      ]);

      await service.recordSwipe(USER_ID, TARGET_ID, 'PASS');

      expect(prisma.$transaction).not.toHaveBeenCalled();
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
      prisma.boost.create.mockResolvedValue({
        id: 'boost-1',
        expiresAt,
        viewCount: 0,
        tier: 'STANDARD',
        viewMultiplier: 1,
      });

      const result = await service.activateBoost(USER_ID);

      expect(prisma.boost.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, expiresAt: expect.any(Date), tier: 'STANDARD', viewMultiplier: 1 },
      });
      expect(result).toEqual({
        active: true,
        expiresAt: expiresAt.toISOString(),
        viewCount: 0,
        tier: 'STANDARD',
        viewMultiplier: 1,
      });
    });
  });

  describe('activateSuperBoost', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.activateSuperBoost(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects users below the Platinum subscription tier', async () => {
      prisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'GOLD' });

      await expect(service.activateSuperBoost(USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects activating a boost while one is already active', async () => {
      prisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'PLATINUM' });
      prisma.boost.findFirst.mockResolvedValue({ id: 'boost-1' });

      await expect(service.activateSuperBoost(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.boost.create).not.toHaveBeenCalled();
    });

    it('uses the peak-hour multiplier during the peak UTC window', async () => {
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 0, 1, 19, 0, 0)));
      prisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'PLATINUM' });
      prisma.boost.findFirst.mockResolvedValue(null);
      prisma.boost.create.mockResolvedValue({
        id: 'boost-1',
        expiresAt: new Date(Date.UTC(2026, 0, 1, 19, 30, 0)),
        viewCount: 0,
        tier: 'SUPER',
        viewMultiplier: 100,
      });

      const result = await service.activateSuperBoost(USER_ID);

      expect(prisma.boost.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, expiresAt: expect.any(Date), tier: 'SUPER', viewMultiplier: 100 },
      });
      expect(result.viewMultiplier).toBe(100);
      jest.useRealTimers();
    });

    it('uses the smaller off-peak multiplier outside the peak UTC window', async () => {
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 0, 1, 5, 0, 0)));
      prisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'PLATINUM' });
      prisma.boost.findFirst.mockResolvedValue(null);
      prisma.boost.create.mockResolvedValue({
        id: 'boost-1',
        expiresAt: new Date(Date.UTC(2026, 0, 1, 5, 30, 0)),
        viewCount: 0,
        tier: 'SUPER',
        viewMultiplier: 10,
      });

      const result = await service.activateSuperBoost(USER_ID);

      expect(prisma.boost.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, expiresAt: expect.any(Date), tier: 'SUPER', viewMultiplier: 10 },
      });
      expect(result.viewMultiplier).toBe(10);
      jest.useRealTimers();
    });
  });

  describe('getBoostStatus', () => {
    it('reports inactive when there is no current boost', async () => {
      prisma.boost.findFirst.mockResolvedValue(null);

      const result = await service.getBoostStatus(USER_ID);

      expect(result).toEqual({ active: false, expiresAt: null, viewCount: 0, tier: null, viewMultiplier: 1 });
    });

    it('reports the active boost with its view count', async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      prisma.boost.findFirst.mockResolvedValue({
        id: 'boost-1',
        expiresAt,
        viewCount: 5,
        tier: 'STANDARD',
        viewMultiplier: 1,
      });

      const result = await service.getBoostStatus(USER_ID);

      expect(result).toEqual({
        active: true,
        expiresAt: expiresAt.toISOString(),
        viewCount: 5,
        tier: 'STANDARD',
        viewMultiplier: 1,
      });
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
          { swiperId: 'liker-2', action: 'SUPER_LIKE', complimentText: null, complimentTarget: null },
          {
            swiperId: 'liker-1',
            action: 'LIKE',
            complimentText: 'Love your hiking photo!',
            complimentTarget: 'your hiking photo',
          },
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
        select: { swiperId: true, action: true, complimentText: true, complimentTarget: true },
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
      expect(grid[0].complimentText).toBeNull();
      expect(grid[1].isSuperLike).toBe(false);
      expect(grid[1].complimentText).toBe('Love your hiking photo!');
      expect(grid[1].complimentTarget).toBe('your hiking photo');
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

    it('rejects an unknown sortBy value', async () => {
      await expect(
        service.getLikedByGrid(USER_ID, 'NOT_A_REAL_SORT' as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('re-sorts the backlog nearest-first for PROXIMITY', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        isPremium: true,
        latitude: 40.7128,
        longitude: -74.006,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
        activeMode: 'DATING',
        ...noFilters,
      });
      prisma.swipe.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { swiperId: 'far-liker', action: 'LIKE', complimentText: null, complimentTarget: null },
          { swiperId: 'near-liker', action: 'LIKE', complimentText: null, complimentTarget: null },
        ]); // liked in this order (most recent first), but far-liker is farther away
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'far-liker',
          name: 'Far',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: null,
          latitude: 51.5074,
          longitude: -0.1278,
        },
        {
          id: 'near-liker',
          name: 'Near',
          dateOfBirth: null,
          profilePhotoUrl: null,
          interests: [],
          relationshipGoal: null,
          latitude: 40.73,
          longitude: -73.99,
        },
      ]);

      const grid = await service.getLikedByGrid(USER_ID, 'PROXIMITY');

      expect(grid.map((card) => card.id)).toEqual(['near-liker', 'far-liker']);
      expect(matchingService.getCompatibility).not.toHaveBeenCalled();
    });

    it('re-sorts the backlog by compatibility score for COMPATIBILITY', async () => {
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
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { swiperId: 'low-compat', action: 'LIKE', complimentText: null, complimentTarget: null },
          { swiperId: 'high-compat', action: 'LIKE', complimentText: null, complimentTarget: null },
        ]); // liked in this order, but high-compat scores higher
      prisma.user.findMany.mockResolvedValue([
        { id: 'low-compat', name: 'Low', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
        { id: 'high-compat', name: 'High', dateOfBirth: null, profilePhotoUrl: null, interests: [], relationshipGoal: null },
      ]);
      matchingService.getCompatibility.mockImplementation((_userId: string, otherId: string) =>
        Promise.resolve({ percentage: otherId === 'high-compat' ? 95 : 20 }),
      );

      const grid = await service.getLikedByGrid(USER_ID, 'COMPATIBILITY');

      expect(grid.map((card) => card.id)).toEqual(['high-compat', 'low-compat']);
    });
  });

  describe('setSnoozeMode', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setSnoozeMode(USER_ID, true)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('clears the snooze and status message when disabling', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      prisma.user.update.mockResolvedValue({ snoozedUntil: null, snoozeStatusMessage: null });

      const result = await service.setSnoozeMode(USER_ID, false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { snoozedUntil: null, snoozeStatusMessage: null },
      });
      expect(result).toEqual({ snoozedUntil: null, statusMessage: null });
    });

    it('defaults to a 7-day snooze when no end date is given', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      prisma.user.update.mockImplementation(({ data }) =>
        Promise.resolve({ snoozedUntil: data.snoozedUntil, snoozeStatusMessage: data.snoozeStatusMessage }),
      );

      const result = await service.setSnoozeMode(USER_ID, true);

      const updateCall = prisma.user.update.mock.calls[0][0];
      const snoozedUntil = updateCall.data.snoozedUntil as Date;
      const daysAhead = (snoozedUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysAhead).toBeGreaterThan(6.9);
      expect(daysAhead).toBeLessThan(7.1);
      expect(result.snoozedUntil).toBe(snoozedUntil.toISOString());
      expect(result.statusMessage).toBeNull();
    });

    it('snoozes until the given date when provided', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      const until = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      prisma.user.update.mockImplementation(({ data }) =>
        Promise.resolve({ snoozedUntil: data.snoozedUntil, snoozeStatusMessage: data.snoozeStatusMessage }),
      );

      const result = await service.setSnoozeMode(USER_ID, true, until);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { snoozedUntil: new Date(until), snoozeStatusMessage: null },
      });
      expect(result.snoozedUntil).toBe(until);
    });

    it('stores a custom out-of-office status message when snoozing', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      prisma.user.update.mockImplementation(({ data }) =>
        Promise.resolve({ snoozedUntil: data.snoozedUntil, snoozeStatusMessage: data.snoozeStatusMessage }),
      );

      const result = await service.setSnoozeMode(USER_ID, true, undefined, 'On Vacation');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ snoozeStatusMessage: 'On Vacation' }) }),
      );
      expect(result.statusMessage).toBe('On Vacation');
    });

    it('rejects an end date that is not in the future', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      const pastDate = new Date(Date.now() - 60_000).toISOString();

      await expect(service.setSnoozeMode(USER_ID, true, pastDate)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an end date beyond the maximum snooze duration', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      const farFuture = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();

      await expect(service.setSnoozeMode(USER_ID, true, farFuture)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('getSnoozeStatus', () => {
    it('throws when the current user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getSnoozeStatus(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports null when there is no active snooze', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        snoozedUntil: null,
        snoozeStatusMessage: null,
      });

      const result = await service.getSnoozeStatus(USER_ID);

      expect(result).toEqual({ snoozedUntil: null, statusMessage: null });
    });

    it('reports the active snooze end date and status message', async () => {
      const snoozedUntil = new Date(Date.now() + 60_000);
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        snoozedUntil,
        snoozeStatusMessage: 'On Vacation',
      });

      const result = await service.getSnoozeStatus(USER_ID);

      expect(result).toEqual({ snoozedUntil: snoozedUntil.toISOString(), statusMessage: 'On Vacation' });
    });

    it('treats an expired snooze as inactive and hides the status message', async () => {
      const expired = new Date(Date.now() - 60_000);
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        snoozedUntil: expired,
        snoozeStatusMessage: 'On Vacation',
      });

      const result = await service.getSnoozeStatus(USER_ID);

      expect(result).toEqual({ snoozedUntil: null, statusMessage: null });
    });
  });
});
