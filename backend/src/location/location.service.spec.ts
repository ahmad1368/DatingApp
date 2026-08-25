import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationService } from './location.service';

const USER_ID = 'user-1';

describe('LocationService', () => {
  let service: LocationService;
  let prisma: {
    user: { update: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
    pathCrossing: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: {
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      pathCrossing: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new LocationService(prisma as unknown as PrismaService);
  });

  describe('updateLocation', () => {
    it('persists the coordinates and a timestamp', async () => {
      prisma.user.update.mockResolvedValue({
        latitude: 51.5,
        longitude: -0.12,
        locationUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.updateLocation(USER_ID, 51.5, -0.12);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { latitude: 51.5, longitude: -0.12, locationUpdatedAt: expect.any(Date) },
      });
      expect(result).toEqual({
        latitude: 51.5,
        longitude: -0.12,
        locationUpdatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('updateLocation crossing detection', () => {
    it('logs a crossing with a recently-active user inside the crossing radius', async () => {
      prisma.user.update.mockResolvedValue({
        latitude: 0,
        longitude: 0,
        locationUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.user.findMany.mockResolvedValue([
        { id: 'other-user', latitude: 0.0005, longitude: 0 }, // ~55m away
      ]);
      prisma.pathCrossing.findFirst.mockResolvedValue(null);

      await service.updateLocation(USER_ID, 0, 0);

      expect(prisma.pathCrossing.create).toHaveBeenCalledWith({
        data: {
          userAId: [USER_ID, 'other-user'].sort()[0],
          userBId: [USER_ID, 'other-user'].sort()[1],
          latitude: 0,
          longitude: 0,
          distanceKm: expect.any(Number),
          crossedAt: expect.any(Date),
        },
      });
    });

    it('does not log a crossing with a user outside the crossing radius', async () => {
      prisma.user.update.mockResolvedValue({
        latitude: 0,
        longitude: 0,
        locationUpdatedAt: new Date(),
      });
      prisma.user.findMany.mockResolvedValue([
        { id: 'far-user', latitude: 1, longitude: 1 }, // far beyond 100m
      ]);

      await service.updateLocation(USER_ID, 0, 0);

      expect(prisma.pathCrossing.create).not.toHaveBeenCalled();
    });

    it('does not log a duplicate crossing within the dedupe window', async () => {
      prisma.user.update.mockResolvedValue({
        latitude: 0,
        longitude: 0,
        locationUpdatedAt: new Date(),
      });
      prisma.user.findMany.mockResolvedValue([{ id: 'other-user', latitude: 0.0005, longitude: 0 }]);
      prisma.pathCrossing.findFirst.mockResolvedValue({ id: 'existing-crossing' });

      await service.updateLocation(USER_ID, 0, 0);

      expect(prisma.pathCrossing.create).not.toHaveBeenCalled();
    });

    it('only considers users who pinged their location recently', async () => {
      prisma.user.update.mockResolvedValue({
        latitude: 0,
        longitude: 0,
        locationUpdatedAt: new Date(),
      });

      await service.updateLocation(USER_ID, 0, 0);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { not: USER_ID },
          latitude: { not: null },
          longitude: { not: null },
          locationUpdatedAt: { gte: expect.any(Date) },
        },
        select: { id: true, latitude: true, longitude: true },
      });
    });
  });

  describe('getCrossedPaths', () => {
    it('returns an empty list when there are no recent crossings', async () => {
      prisma.pathCrossing.findMany.mockResolvedValue([]);

      const result = await service.getCrossedPaths(USER_ID);

      expect(result).toEqual([]);
    });

    it('groups crossings by the other user, counting and taking the closest distance', async () => {
      prisma.pathCrossing.findMany.mockResolvedValue([
        {
          userAId: USER_ID,
          userBId: 'other-user',
          distanceKm: 0.08,
          crossedAt: new Date('2026-01-01T12:00:00.000Z'),
        },
        {
          userAId: 'other-user',
          userBId: USER_ID,
          distanceKm: 0.03,
          crossedAt: new Date('2026-01-01T09:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'other-user', name: 'Alex', profilePhotoUrl: 'alex.jpg' },
      ]);

      const result = await service.getCrossedPaths(USER_ID);

      expect(result).toEqual([
        {
          id: 'other-user',
          name: 'Alex',
          profilePhotoUrl: 'alex.jpg',
          crossCount: 2,
          closestDistanceKm: 0.03,
          lastCrossedAt: '2026-01-01T12:00:00.000Z',
        },
      ]);
    });
  });

  describe('updateSearchRadius', () => {
    it('persists the radius', async () => {
      prisma.user.update.mockResolvedValue({ searchRadiusKm: 25 });

      const result = await service.updateSearchRadius(USER_ID, 25);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { searchRadiusKm: 25 },
      });
      expect(result).toEqual({ searchRadiusKm: 25 });
    });
  });

  describe('getRadiusSettings', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getRadiusSettings(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the search radius, auto-expand preference, and distance unit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        searchRadiusKm: 25,
        autoExpandRadiusEnabled: false,
        distanceUnit: 'MI',
      });

      const result = await service.getRadiusSettings(USER_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { searchRadiusKm: true, autoExpandRadiusEnabled: true, distanceUnit: true },
      });
      expect(result).toEqual({ searchRadiusKm: 25, autoExpandRadiusEnabled: false, distanceUnit: 'MI' });
    });
  });

  describe('setAutoExpandRadius', () => {
    it('persists the preference', async () => {
      prisma.user.update.mockResolvedValue({
        searchRadiusKm: 50,
        autoExpandRadiusEnabled: false,
        distanceUnit: 'KM',
      });

      const result = await service.setAutoExpandRadius(USER_ID, false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { autoExpandRadiusEnabled: false },
      });
      expect(result).toEqual({ searchRadiusKm: 50, autoExpandRadiusEnabled: false, distanceUnit: 'KM' });
    });
  });

  describe('setDistanceUnit', () => {
    it('persists the unit preference without changing the stored km radius', async () => {
      prisma.user.update.mockResolvedValue({
        searchRadiusKm: 50,
        autoExpandRadiusEnabled: true,
        distanceUnit: 'MI',
      });

      const result = await service.setDistanceUnit(USER_ID, 'MI');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { distanceUnit: 'MI' },
      });
      expect(result).toEqual({ searchRadiusKm: 50, autoExpandRadiusEnabled: true, distanceUnit: 'MI' });
    });
  });

  describe('findNearbyUsers', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findNearbyUsers(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the current user has no location set', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, latitude: null, longitude: null });

      await expect(service.findNearbyUsers(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('filters out users beyond the search radius and sorts by distance', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: 0,
        longitude: 0,
        searchRadiusKm: 50,
      });
      prisma.user.findMany.mockResolvedValue([
        { id: 'far-user', name: 'Far', latitude: 10, longitude: 10 }, // ~1500km away
        { id: 'near-user', name: 'Near', latitude: 0.1, longitude: 0 }, // ~11km away
        { id: 'mid-user', name: 'Mid', latitude: 0.3, longitude: 0 }, // ~33km away
      ]);

      const result = await service.findNearbyUsers(USER_ID);

      expect(result.map((u) => u.id)).toEqual(['near-user', 'mid-user']);
      expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
    });

    it('searches around the passport location instead of the real location when enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        latitude: 0,
        longitude: 0,
        searchRadiusKm: 50,
        passportEnabled: true,
        passportLatitude: 10,
        passportLongitude: 10,
      });
      prisma.user.findMany.mockResolvedValue([
        { id: 'near-real-location', name: 'NearReal', latitude: 0.1, longitude: 0 },
        { id: 'near-passport-location', name: 'NearPassport', latitude: 10.1, longitude: 10 },
      ]);

      const result = await service.findNearbyUsers(USER_ID);

      expect(result.map((u) => u.id)).toEqual(['near-passport-location']);
    });
  });

  describe('setPassportLocation', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setPassportLocation(USER_ID, 10, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for non-premium users', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, isPremium: false });

      await expect(service.setPassportLocation(USER_ID, 10, 10)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sets the passport location and enables it for premium users', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, isPremium: true });
      prisma.user.update.mockResolvedValue({
        passportEnabled: true,
        passportLatitude: 48.8566,
        passportLongitude: 2.3522,
      });

      const result = await service.setPassportLocation(USER_ID, 48.8566, 2.3522);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { passportLatitude: 48.8566, passportLongitude: 2.3522, passportEnabled: true },
      });
      expect(result).toEqual({
        passportEnabled: true,
        latitude: 48.8566,
        longitude: 2.3522,
      });
    });
  });

  describe('clearPassportLocation', () => {
    it('disables passport mode', async () => {
      prisma.user.update.mockResolvedValue({
        passportEnabled: false,
        passportLatitude: 48.8566,
        passportLongitude: 2.3522,
      });

      const result = await service.clearPassportLocation(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { passportEnabled: false },
      });
      expect(result.passportEnabled).toBe(false);
    });
  });
});
