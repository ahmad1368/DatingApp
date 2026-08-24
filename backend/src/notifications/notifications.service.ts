import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_NOTIFICATIONS_RETURNED, NotificationType } from './notifications.constants';

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationFeed {
  notifications: NotificationView[];
  unreadCount: number;
}

/**
 * In-app notification feed (new match, new message, ...) that the client
 * polls. No real WebSocket/FCM/APNs transport exists in this codebase - see
 * the doc comment on the Notification/DeviceToken Prisma models. Callers
 * elsewhere in the backend raise a notification via [notify]; this service
 * doesn't push to any external provider itself.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, title, body, data: (data as Prisma.InputJsonValue) ?? undefined },
    });
  }

  async listMyNotifications(userId: string): Promise<NotificationFeed> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_NOTIFICATIONS_RETURNED,
    });

    const unreadCount = await this.prisma.notification.count({ where: { userId, readAt: null } });

    return {
      notifications: notifications.map((notification) => this.toView(notification)),
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationView> {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('You do not own this notification.');
    }

    const updated = notification.readAt
      ? notification
      : await this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });

    return this.toView(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async registerDeviceToken(userId: string, token: string, platform: string): Promise<{ registered: true }> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { registered: true };
  }

  async removeDeviceToken(userId: string, token: string): Promise<{ removed: boolean }> {
    const deviceToken = await this.prisma.deviceToken.findUnique({ where: { token } });
    if (!deviceToken) {
      throw new NotFoundException('Device token not found.');
    }
    if (deviceToken.userId !== userId) {
      throw new ForbiddenException('You do not own this device token.');
    }

    await this.prisma.deviceToken.delete({ where: { token } });
    return { removed: true };
  }

  private toView(notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    data: unknown;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationView {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: (notification.data as Record<string, unknown> | null) ?? null,
      read: notification.readAt != null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
