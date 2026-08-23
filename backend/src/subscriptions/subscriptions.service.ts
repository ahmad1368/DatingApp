import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaidSubscriptionTier,
  SUBSCRIPTION_PERIOD_DAYS,
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  SubscriptionTier,
} from './subscriptions.constants';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  isActive: boolean;
  expiresAt: string | null;
  canceledAt: string | null;
}

export interface SubscriptionGiftView {
  id: string;
  tier: PaidSubscriptionTier;
  createdAt: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserPhotoUrl: string | null;
}

export interface GiftSubscriptionResult {
  recipientStatus: SubscriptionStatus;
  gift: SubscriptionGiftView;
}

interface SubscriptionRecord {
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
  subscriptionCanceledAt: Date | null;
  isPremium: boolean;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
  }

  async getStatus(userId: string): Promise<SubscriptionStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.effectiveStatus(userId, user);
  }

  /**
   * Activates a paid tier for one billing period. There's no store/payment
   * receipt to validate (see subscriptions.constants.ts) - this directly
   * grants entitlement, which is what a webhook confirming a real purchase
   * would otherwise trigger.
   */
  async subscribe(userId: string, tier: PaidSubscriptionTier): Promise<SubscriptionStatus> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: tier,
        subscriptionExpiresAt: expiresAt,
        subscriptionCanceledAt: null,
        isPremium: true,
      },
    });

    return this.toStatus(updated);
  }

  /**
   * Gifts a paid tier to another active member - directly grants them a
   * fresh billing period of that tier (same no-payment-gateway shortcut as
   * [subscribe]) and records who sent it.
   */
  async giftSubscription(
    senderId: string,
    recipientId: string,
    tier: PaidSubscriptionTier,
  ): Promise<GiftSubscriptionResult> {
    if (recipientId === senderId) {
      throw new BadRequestException('You cannot gift a subscription to yourself.');
    }

    const recipient = await this.prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) {
      throw new NotFoundException('Recipient not found.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const [updatedRecipient, gift] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: recipientId },
        data: {
          subscriptionTier: tier,
          subscriptionExpiresAt: expiresAt,
          subscriptionCanceledAt: null,
          isPremium: true,
        },
      }),
      this.prisma.subscriptionGift.create({ data: { senderId, recipientId, tier } }),
    ]);

    return {
      recipientStatus: this.toStatus(updatedRecipient),
      gift: {
        id: gift.id,
        tier,
        createdAt: gift.createdAt.toISOString(),
        otherUserId: recipient.id,
        otherUserName: recipient.name,
        otherUserPhotoUrl: recipient.profilePhotoUrl,
      },
    };
  }

  async listReceivedSubscriptionGifts(userId: string): Promise<SubscriptionGiftView[]> {
    const gifts = await this.prisma.subscriptionGift.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
    });
    if (gifts.length === 0) {
      return [];
    }

    const senderIds = [...new Set(gifts.map((gift) => gift.senderId))];
    const senders = await this.prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const senderById = new Map(senders.map((sender) => [sender.id, sender]));

    return gifts.map((gift) => {
      const sender = senderById.get(gift.senderId);
      return {
        id: gift.id,
        tier: gift.tier as PaidSubscriptionTier,
        createdAt: gift.createdAt.toISOString(),
        otherUserId: gift.senderId,
        otherUserName: sender?.name ?? null,
        otherUserPhotoUrl: sender?.profilePhotoUrl ?? null,
      };
    });
  }

  /** Immediately reverts to the free tier - no partial-period entitlement is retained. */
  async cancel(userId: string): Promise<SubscriptionStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const current = await this.effectiveStatus(userId, user);
    if (current.tier === 'FREE') {
      throw new BadRequestException('You are not subscribed to a paid tier.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
        subscriptionCanceledAt: new Date(),
        isPremium: false,
      },
    });

    return this.toStatus(updated);
  }

  /**
   * Lazily expires a lapsed subscription on read, self-healing `isPremium`
   * in the DB (the same lazy-expiry approach the codebase already uses for
   * boosts and matches) since there's no background job to do it eagerly.
   */
  private async effectiveStatus(userId: string, user: SubscriptionRecord): Promise<SubscriptionStatus> {
    const now = new Date();
    const lapsed =
      user.subscriptionTier !== 'FREE' &&
      user.subscriptionExpiresAt != null &&
      user.subscriptionExpiresAt <= now;

    if (!lapsed) {
      return this.toStatus(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: 'FREE', subscriptionExpiresAt: null, isPremium: false },
    });

    return this.toStatus(updated);
  }

  private toStatus(user: SubscriptionRecord): SubscriptionStatus {
    return {
      tier: user.subscriptionTier as SubscriptionTier,
      isActive: user.subscriptionTier !== 'FREE',
      expiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
      canceledAt: user.subscriptionCanceledAt ? user.subscriptionCanceledAt.toISOString() : null,
    };
  }
}
