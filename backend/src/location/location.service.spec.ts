import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  });
});
