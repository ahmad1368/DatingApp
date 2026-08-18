import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationService } from './location.service';

const USER_ID = 'user-1';

describe('LocationService', () => {
  let service: LocationService;
  let prisma: { user: { update: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      user: {
        update: jest.fn(),
        findUnique: jest.fn(),
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
