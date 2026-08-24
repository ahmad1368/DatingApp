import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';
const NOTIFICATION_ID = 'notification-1';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    deviceToken: { upsert: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      deviceToken: { upsert: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    };
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  describe('notify', () => {
    it('creates a notification record for the recipient', async () => {
      await service.notify(USER_ID, 'NEW_MATCH', "It's a match!", 'You matched with someone new.', {
        matchId: 'match-1',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          type: 'NEW_MATCH',
          title: "It's a match!",
          body: 'You matched with someone new.',
          data: { matchId: 'match-1' },
        },
      });
    });
  });

  describe('listMyNotifications', () => {
    it('returns the feed newest-first with an unread count', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'n1',
          type: 'NEW_MESSAGE',
          title: 'New message',
          body: 'Hi there',
          data: { matchId: 'match-1' },
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.listMyNotifications(USER_ID);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result.unreadCount).toBe(1);
      expect(result.notifications[0]).toEqual({
        id: 'n1',
        type: 'NEW_MESSAGE',
        title: 'New message',
        body: 'Hi there',
        data: { matchId: 'match-1' },
        read: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('markRead', () => {
    it('throws when the notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead(USER_ID, NOTIFICATION_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects marking a notification owned by someone else', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: NOTIFICATION_ID, userId: OTHER_ID });

      await expect(service.markRead(USER_ID, NOTIFICATION_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('marks an unread notification as read', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: NOTIFICATION_ID, userId: USER_ID, readAt: null });
      prisma.notification.update.mockResolvedValue({
        id: NOTIFICATION_ID,
        type: 'NEW_MATCH',
        title: 'x',
        body: 'y',
        data: null,
        readAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.markRead(USER_ID, NOTIFICATION_ID);

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIFICATION_ID },
        data: { readAt: expect.any(Date) },
      });
      expect(result.read).toBe(true);
    });

    it('does not re-update an already-read notification', async () => {
      const readAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.notification.findUnique.mockResolvedValue({
        id: NOTIFICATION_ID,
        userId: USER_ID,
        type: 'NEW_MATCH',
        title: 'x',
        body: 'y',
        data: null,
        readAt,
        createdAt: readAt,
      });

      await service.markRead(USER_ID, NOTIFICATION_ID);

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('bulk-marks unread notifications and returns the count updated', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllRead(USER_ID);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ updated: 3 });
    });
  });

  describe('registerDeviceToken', () => {
    it('upserts the device token by its unique token value', async () => {
      prisma.deviceToken.upsert.mockResolvedValue({});

      const result = await service.registerDeviceToken(USER_ID, 'expo-token-1', 'IOS');

      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: 'expo-token-1' },
        create: { userId: USER_ID, token: 'expo-token-1', platform: 'IOS' },
        update: { userId: USER_ID, platform: 'IOS' },
      });
      expect(result).toEqual({ registered: true });
    });
  });

  describe('removeDeviceToken', () => {
    it('throws when the token does not exist', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue(null);

      await expect(service.removeDeviceToken(USER_ID, 'unknown-token')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects removing a token owned by someone else', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({ token: 'expo-token-1', userId: OTHER_ID });

      await expect(service.removeDeviceToken(USER_ID, 'expo-token-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('deletes the token when owned by the caller', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({ token: 'expo-token-1', userId: USER_ID });

      const result = await service.removeDeviceToken(USER_ID, 'expo-token-1');

      expect(prisma.deviceToken.delete).toHaveBeenCalledWith({ where: { token: 'expo-token-1' } });
      expect(result).toEqual({ removed: true });
    });
  });
});
