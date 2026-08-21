import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileVisitsService } from './profile-visits.service';

const VISITOR_ID = 'visitor-1';
const VISITED_ID = 'visited-1';

describe('ProfileVisitsService', () => {
  let service: ProfileVisitsService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    profileVisit: { create: jest.Mock; findMany: jest.Mock };
    blockedContact: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      profileVisit: { create: jest.fn(), findMany: jest.fn() },
      blockedContact: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ProfileVisitsService(prisma as unknown as PrismaService);
  });

  describe('recordVisit', () => {
    it('rejects visiting your own profile', async () => {
      await expect(service.recordVisit(VISITOR_ID, VISITOR_ID, false)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the visited user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.recordVisit(VISITOR_ID, VISITED_ID, false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('records a normal (non-anonymous) visit', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: VISITED_ID });

      const result = await service.recordVisit(VISITOR_ID, VISITED_ID, false);

      expect(prisma.profileVisit.create).toHaveBeenCalledWith({
        data: { visitorId: VISITOR_ID, visitedUserId: VISITED_ID },
      });
      expect(result).toEqual({ recorded: true });
    });

    it('rejects anonymous browsing for a non-premium visitor', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: VISITOR_ID, isPremium: false });

      await expect(service.recordVisit(VISITOR_ID, VISITED_ID, true)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.profileVisit.create).not.toHaveBeenCalled();
    });

    it('skips recording entirely for a premium visitor browsing anonymously', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: VISITOR_ID, isPremium: true });

      const result = await service.recordVisit(VISITOR_ID, VISITED_ID, true);

      expect(prisma.profileVisit.create).not.toHaveBeenCalled();
      expect(result).toEqual({ recorded: false });
    });
  });

  describe('listVisitors', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.listVisitors(VISITED_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a non-premium user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: VISITED_ID, isPremium: false });

      await expect(service.listVisitors(VISITED_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns an empty list without querying users when nobody has visited', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: VISITED_ID, isPremium: true });
      prisma.profileVisit.findMany.mockResolvedValue([]);

      const result = await service.listVisitors(VISITED_ID);

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('dedupes repeat visitors, keeping only their most recent visit', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: VISITED_ID, isPremium: true });
      prisma.profileVisit.findMany.mockResolvedValue([
        { visitorId: 'visitor-a', createdAt: new Date('2026-01-02T00:00:00.000Z') },
        { visitorId: 'visitor-a', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { visitorId: 'visitor-b', createdAt: new Date('2026-01-01T12:00:00.000Z') },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'visitor-a', name: 'Alex', profilePhotoUrl: 'alex.jpg' },
        { id: 'visitor-b', name: 'Bo', profilePhotoUrl: null },
      ]);

      const result = await service.listVisitors(VISITED_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['visitor-a', 'visitor-b'] } },
        select: { id: true, name: true, profilePhotoUrl: true },
      });
      expect(result).toEqual([
        {
          visitorId: 'visitor-a',
          visitorName: 'Alex',
          visitorPhotoUrl: 'alex.jpg',
          visitedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          visitorId: 'visitor-b',
          visitorName: 'Bo',
          visitorPhotoUrl: null,
          visitedAt: '2026-01-01T12:00:00.000Z',
        },
      ]);
    });

    it('excludes blocked visitors from the visitor query', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: VISITED_ID, isPremium: true });
      prisma.blockedContact.findMany.mockResolvedValueOnce([{ blockedUserId: 'blocked-1' }]).mockResolvedValueOnce([]);
      prisma.profileVisit.findMany.mockResolvedValue([]);

      await service.listVisitors(VISITED_ID);

      expect(prisma.profileVisit.findMany).toHaveBeenCalledWith({
        where: { visitedUserId: VISITED_ID, visitorId: { notIn: ['blocked-1'] } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
