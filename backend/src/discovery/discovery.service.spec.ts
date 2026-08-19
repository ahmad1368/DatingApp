import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from './discovery.service';

const USER_ID = 'user-1';
const TARGET_ID = 'user-2';

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    swipe: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    match: { create: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      swipe: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      match: { create: jest.fn() },
    };
    service = new DiscoveryService(prisma as unknown as PrismaService);
  });

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
      });
      prisma.swipe.findMany.mockResolvedValue([{ targetUserId: 'already-swiped' }]);
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
        },
        take: 20,
      });
      expect(deck).toHaveLength(1);
      expect(deck[0].id).toBe(TARGET_ID);
      expect(deck[0].age).toBe(25);
      expect(deck[0].distanceKm).toBeGreaterThan(0);
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
        data: { userAId: [USER_ID, TARGET_ID].sort()[0], userBId: [USER_ID, TARGET_ID].sort()[1] },
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
  });
});
