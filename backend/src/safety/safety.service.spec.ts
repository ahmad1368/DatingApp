import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from '../auth/interfaces/sms-provider.interface';
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
    emergencyContact: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    sosAlert: { create: jest.Mock };
    dateLocationShare: { create: jest.Mock };
  };
  let smsProvider: SmsProvider;

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
      emergencyContact: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      sosAlert: { create: jest.fn() },
      dateLocationShare: { create: jest.fn() },
    };
    smsProvider = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
    service = new SafetyService(prisma as unknown as PrismaService, smsProvider);
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
      expect(checkIns[0].alertSent).toBe(false);
    });

    it('sends an alert to the emergency contact once a check-in goes overdue', async () => {
      const overdueScheduledAt = new Date(Date.now() - 60 * 60 * 1000);
      prisma.dateCheckIn.findMany.mockResolvedValue([
        {
          id: CHECK_IN_ID,
          matchId: null,
          location: 'Blue Bottle Coffee',
          scheduledAt: overdueScheduledAt,
          emergencyContactName: 'Sam',
          emergencyContactPhone: '+15551234567',
          notes: null,
          confirmedAt: null,
          alertSentAt: null,
        },
      ]);

      const checkIns = await service.listCheckIns(USER_ID);

      expect(smsProvider.sendMessage).toHaveBeenCalledWith(
        '+15551234567',
        expect.stringContaining('Blue Bottle Coffee'),
      );
      expect(prisma.dateCheckIn.update).toHaveBeenCalledWith({
        where: { id: CHECK_IN_ID },
        data: { alertSentAt: expect.any(Date) },
      });
      expect(checkIns[0].alertSent).toBe(true);
    });

    it('does not re-send an alert that has already gone out', async () => {
      const overdueScheduledAt = new Date(Date.now() - 60 * 60 * 1000);
      prisma.dateCheckIn.findMany.mockResolvedValue([
        {
          id: CHECK_IN_ID,
          matchId: null,
          location: null,
          scheduledAt: overdueScheduledAt,
          emergencyContactName: 'Sam',
          emergencyContactPhone: '+15551234567',
          notes: null,
          confirmedAt: null,
          alertSentAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const checkIns = await service.listCheckIns(USER_ID);

      expect(smsProvider.sendMessage).not.toHaveBeenCalled();
      expect(prisma.dateCheckIn.update).not.toHaveBeenCalled();
      expect(checkIns[0].alertSent).toBe(true);
    });

    it('does not send an alert when there is no emergency contact phone', async () => {
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
          confirmedAt: null,
          alertSentAt: null,
        },
      ]);

      await service.listCheckIns(USER_ID);

      expect(smsProvider.sendMessage).not.toHaveBeenCalled();
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

  describe('addEmergencyContact', () => {
    it('creates and returns the contact', async () => {
      prisma.emergencyContact.create.mockResolvedValue({
        id: 'contact-1',
        name: 'Sam',
        phone: '+15551234567',
      });

      const contact = await service.addEmergencyContact(USER_ID, 'Sam', '+15551234567');

      expect(prisma.emergencyContact.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, name: 'Sam', phone: '+15551234567' },
      });
      expect(contact).toEqual({ id: 'contact-1', name: 'Sam', phone: '+15551234567' });
    });
  });

  describe('listEmergencyContacts', () => {
    it("returns the user's contacts", async () => {
      prisma.emergencyContact.findMany.mockResolvedValue([
        { id: 'contact-1', name: 'Sam', phone: '+15551234567' },
      ]);

      const contacts = await service.listEmergencyContacts(USER_ID);

      expect(prisma.emergencyContact.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { createdAt: 'asc' },
      });
      expect(contacts).toEqual([{ id: 'contact-1', name: 'Sam', phone: '+15551234567' }]);
    });
  });

  describe('deleteEmergencyContact', () => {
    it('throws when the contact does not exist', async () => {
      prisma.emergencyContact.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteEmergencyContact(USER_ID, 'contact-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws when deleting someone else's contact", async () => {
      prisma.emergencyContact.findUnique.mockResolvedValue({ id: 'contact-1', userId: OTHER_ID });

      await expect(
        service.deleteEmergencyContact(OUTSIDER_ID, 'contact-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the contact', async () => {
      prisma.emergencyContact.findUnique.mockResolvedValue({ id: 'contact-1', userId: USER_ID });

      const result = await service.deleteEmergencyContact(USER_ID, 'contact-1');

      expect(prisma.emergencyContact.delete).toHaveBeenCalledWith({ where: { id: 'contact-1' } });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('triggerSos', () => {
    it('rejects when the user has no emergency contacts', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([]);

      await expect(service.triggerSos(USER_ID, 37.7749, -122.4194)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(smsProvider.sendMessage).not.toHaveBeenCalled();
    });

    it('throws when a requested contact id does not belong to the user', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([
        { id: 'contact-1', name: 'Sam', phone: '+15551234567' },
      ]);

      await expect(
        service.triggerSos(USER_ID, 37.7749, -122.4194, undefined, ['not-mine']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('texts every contact when none are specified and records the alert', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([
        { id: 'contact-1', name: 'Sam', phone: '+15551234567' },
        { id: 'contact-2', name: 'Jo', phone: '+15557654321' },
      ]);
      prisma.sosAlert.create.mockResolvedValue({
        id: 'alert-1',
        contactIds: ['contact-1', 'contact-2'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.triggerSos(USER_ID, 37.7749, -122.4194, 'match-1');

      expect(smsProvider.sendMessage).toHaveBeenCalledWith(
        '+15551234567',
        expect.stringContaining('37.7749,-122.4194'),
      );
      expect(smsProvider.sendMessage).toHaveBeenCalledWith(
        '+15557654321',
        expect.stringContaining('Ahmad'),
      );
      expect(prisma.sosAlert.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          matchId: 'match-1',
          latitude: 37.7749,
          longitude: -122.4194,
          contactIds: ['contact-1', 'contact-2'],
        },
      });
      expect(result).toEqual({
        id: 'alert-1',
        notifiedContactIds: ['contact-1', 'contact-2'],
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('only texts the selected contacts when contactIds is given', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([
        { id: 'contact-1', name: 'Sam', phone: '+15551234567' },
        { id: 'contact-2', name: 'Jo', phone: '+15557654321' },
      ]);
      prisma.sosAlert.create.mockResolvedValue({
        id: 'alert-1',
        contactIds: ['contact-2'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.triggerSos(USER_ID, 37.7749, -122.4194, undefined, ['contact-2']);

      expect(smsProvider.sendMessage).toHaveBeenCalledTimes(1);
      expect(smsProvider.sendMessage).toHaveBeenCalledWith('+15557654321', expect.any(String));
    });
  });

  describe('shareDateLocation', () => {
    it('rejects when the user has no emergency contacts', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([]);

      await expect(service.shareDateLocation(USER_ID, 37.7749, -122.4194)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(smsProvider.sendMessage).not.toHaveBeenCalled();
    });

    it('throws when a requested contact id does not belong to the user', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([
        { id: 'contact-1', name: 'Sam', phone: '+15551234567' },
      ]);

      await expect(
        service.shareDateLocation(USER_ID, 37.7749, -122.4194, undefined, undefined, ['not-mine']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('texts every contact when none are specified, including the destination, and records the share', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([
        { id: 'contact-1', name: 'Sam', phone: '+15551234567' },
        { id: 'contact-2', name: 'Jo', phone: '+15557654321' },
      ]);
      prisma.dateLocationShare.create.mockResolvedValue({
        id: 'share-1',
        contactIds: ['contact-1', 'contact-2'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.shareDateLocation(
        USER_ID,
        37.7749,
        -122.4194,
        'match-1',
        '123 Main St',
      );

      expect(smsProvider.sendMessage).toHaveBeenCalledWith(
        '+15551234567',
        expect.stringContaining('123 Main St'),
      );
      expect(smsProvider.sendMessage).toHaveBeenCalledWith(
        '+15557654321',
        expect.stringContaining('37.7749,-122.4194'),
      );
      expect(prisma.dateLocationShare.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          matchId: 'match-1',
          destinationAddress: '123 Main St',
          latitude: 37.7749,
          longitude: -122.4194,
          contactIds: ['contact-1', 'contact-2'],
        },
      });
      expect(result).toEqual({
        id: 'share-1',
        notifiedContactIds: ['contact-1', 'contact-2'],
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('only texts the selected contacts when contactIds is given', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: 'Ahmad' });
      prisma.emergencyContact.findMany.mockResolvedValue([
        { id: 'contact-1', name: 'Sam', phone: '+15551234567' },
        { id: 'contact-2', name: 'Jo', phone: '+15557654321' },
      ]);
      prisma.dateLocationShare.create.mockResolvedValue({
        id: 'share-1',
        contactIds: ['contact-2'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.shareDateLocation(USER_ID, 37.7749, -122.4194, undefined, undefined, ['contact-2']);

      expect(smsProvider.sendMessage).toHaveBeenCalledTimes(1);
      expect(smsProvider.sendMessage).toHaveBeenCalledWith('+15557654321', expect.any(String));
    });
  });
});
