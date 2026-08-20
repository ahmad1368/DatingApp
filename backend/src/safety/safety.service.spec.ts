import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from './safety.service';
import { SAFETY_RESOURCES } from './safety.constants';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';
const OUTSIDER_ID = 'user-3';
const CHECK_IN_ID = 'check-in-1';

describe('SafetyService', () => {
  let service: SafetyService;
  let prisma: {
    user: { findUnique: jest.Mock };
    userReport: { create: jest.Mock };
    dateCheckIn: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      userReport: { create: jest.fn() },
      dateCheckIn: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SafetyService(prisma as unknown as PrismaService);
  });

  describe('getResources', () => {
    it('returns the static list of safety resources', () => {
      expect(service.getResources()).toEqual(SAFETY_RESOURCES);
    });
  });

  describe('reportUser', () => {
    it('rejects reporting yourself', async () => {
      await expect(service.reportUser(USER_ID, USER_ID, 'HARASSMENT')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the reported user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.reportUser(USER_ID, OTHER_ID, 'HARASSMENT')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('creates and returns the report', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: OTHER_ID });
      prisma.userReport.create.mockResolvedValue({
        id: 'report-1',
        reportedUserId: OTHER_ID,
        reason: 'HARASSMENT',
        details: 'Kept messaging after I said stop.',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const report = await service.reportUser(
        USER_ID,
        OTHER_ID,
        'HARASSMENT',
        'Kept messaging after I said stop.',
      );

      expect(prisma.userReport.create).toHaveBeenCalledWith({
        data: {
          reporterId: USER_ID,
          reportedUserId: OTHER_ID,
          reason: 'HARASSMENT',
          details: 'Kept messaging after I said stop.',
        },
      });
      expect(report).toEqual({
        id: 'report-1',
        reportedUserId: OTHER_ID,
        reason: 'HARASSMENT',
        details: 'Kept messaging after I said stop.',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('createCheckIn', () => {
    it('rejects a scheduled time that is not in the future', async () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString();

      await expect(
        service.createCheckIn(USER_ID, { scheduledAt: pastDate }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a check-in and reports it as scheduled', async () => {
      const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      prisma.dateCheckIn.create.mockResolvedValue({
        id: CHECK_IN_ID,
        matchId: null,
        location: 'Blue Bottle Coffee',
        scheduledAt,
        emergencyContactName: 'Sam',
        emergencyContactPhone: '+15551234567',
        notes: null,
        confirmedAt: null,
      });

      const checkIn = await service.createCheckIn(USER_ID, {
        scheduledAt: scheduledAt.toISOString(),
        location: 'Blue Bottle Coffee',
        emergencyContactName: 'Sam',
        emergencyContactPhone: '+15551234567',
      });

      expect(prisma.dateCheckIn.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          matchId: undefined,
          location: 'Blue Bottle Coffee',
          scheduledAt,
          emergencyContactName: 'Sam',
          emergencyContactPhone: '+15551234567',
          notes: undefined,
        },
      });
      expect(checkIn.status).toBe('SCHEDULED');
    });
  });

  describe('listCheckIns', () => {
    it('flags a past-due unconfirmed check-in as overdue', async () => {
      const overdueScheduledAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      prisma.dateCheckIn.findMany.mockResolvedValue([
        {
          id: CHECK_IN_ID,
          matchId: null,
          location: null,
          scheduledAt: overdueScheduledAt,
          emergencyContactName: null,
          emergencyContactPhone: null,
          notes: null,
          confirmedAt: null,
        },
      ]);

      const checkIns = await service.listCheckIns(USER_ID);

      expect(prisma.dateCheckIn.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { scheduledAt: 'desc' },
      });
      expect(checkIns[0].status).toBe('OVERDUE');
    });

    it('does not flag a just-past check-in inside the grace window', async () => {
      const recentlyDue = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      prisma.dateCheckIn.findMany.mockResolvedValue([
        {
          id: CHECK_IN_ID,
          matchId: null,
          location: null,
          scheduledAt: recentlyDue,
          emergencyContactName: null,
          emergencyContactPhone: null,
          notes: null,
          confirmedAt: null,
        },
      ]);

      const checkIns = await service.listCheckIns(USER_ID);

      expect(checkIns[0].status).toBe('SCHEDULED');
    });

    it('reports a confirmed check-in as confirmed even if past due', async () => {
      const overdueScheduledAt = new Date(Date.now() - 60 * 60 * 1000);
      prisma.dateCheckIn.findMany.mockResolvedValue([
        {
          id: CHECK_IN_ID,
          matchId: null,
          location: null,
          scheduledAt: overdueScheduledAt,
          emergencyContactName: null,
          emergencyContactPhone: null,
          notes: null,
          confirmedAt: new Date(),
        },
      ]);

      const checkIns = await service.listCheckIns(USER_ID);

      expect(checkIns[0].status).toBe('CONFIRMED');
    });
  });

  describe('confirmCheckIn', () => {
    it('throws when the check-in does not exist', async () => {
      prisma.dateCheckIn.findUnique.mockResolvedValue(null);

      await expect(service.confirmCheckIn(USER_ID, CHECK_IN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws when confirming someone else's check-in", async () => {
      prisma.dateCheckIn.findUnique.mockResolvedValue({ id: CHECK_IN_ID, userId: OTHER_ID });

      await expect(service.confirmCheckIn(OUTSIDER_ID, CHECK_IN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('marks the check-in confirmed', async () => {
      const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
      const confirmedAt = new Date();
      prisma.dateCheckIn.findUnique.mockResolvedValue({ id: CHECK_IN_ID, userId: USER_ID });
      prisma.dateCheckIn.update.mockResolvedValue({
        id: CHECK_IN_ID,
        matchId: null,
        location: null,
        scheduledAt,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        confirmedAt,
      });

      const checkIn = await service.confirmCheckIn(USER_ID, CHECK_IN_ID);

      expect(prisma.dateCheckIn.update).toHaveBeenCalledWith({
        where: { id: CHECK_IN_ID },
        data: { confirmedAt: expect.any(Date) },
      });
      expect(checkIn.status).toBe('CONFIRMED');
      expect(checkIn.confirmedAt).toBe(confirmedAt.toISOString());
    });
  });
});
