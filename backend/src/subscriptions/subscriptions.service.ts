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
