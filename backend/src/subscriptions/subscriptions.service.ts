import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeSubscribeExpiresAt,
  PaidSubscriptionTier,
  SUBSCRIPTION_PERIOD_DAYS,
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  SubscriptionTier,
  VOUCHER_CODE_LENGTH,
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

export interface SubscriptionVoucherView {
  code: string;
  tier: PaidSubscriptionTier;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  createdAt: string;
}

export interface RedeemVoucherResult {
  status: SubscriptionStatus;
  voucher: SubscriptionVoucherView;
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
   * would otherwise trigger. A mid-cycle upgrade (e.g. Gold to Platinum)
   * carries the unused time on the current tier forward as bonus time on
   * the new one - see computeSubscribeExpiresAt.
   */
  async subscribe(userId: string, tier: PaidSubscriptionTier): Promise<SubscriptionStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const now = new Date();
    const expiresAt = computeSubscribeExpiresAt(
      now,
      user.subscriptionTier as SubscriptionTier,
      user.subscriptionExpiresAt,
      tier,
    );

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

  /**
   * Purchases a standalone digital voucher code for a paid tier - unlike
   * [giftSubscription], it isn't tied to a recipient up front, so it can be
   * shared with anyone (including someone who hasn't signed up yet) and
   * redeemed later via [redeemVoucher]. Same no-payment-gateway shortcut as
   * [subscribe]/[giftSubscription].
   */
  async purchaseVoucher(userId: string, tier: PaidSubscriptionTier): Promise<SubscriptionVoucherView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const code = this.generateVoucherCode();
    const voucher = await this.prisma.subscriptionVoucher.create({
      data: { code, tier, purchasedById: userId },
    });

    return this.toVoucherView(voucher);
  }

  /** Vouchers the caller has purchased, most recent first. */
  async listMyVouchers(userId: string): Promise<SubscriptionVoucherView[]> {
    const vouchers = await this.prisma.subscriptionVoucher.findMany({
      where: { purchasedById: userId },
      orderBy: { createdAt: 'desc' },
    });
    return vouchers.map((voucher) => this.toVoucherView(voucher));
  }

  /**
   * Redeems a voucher code: grants the caller a fresh billing period of the
   * voucher's tier (same flat-period grant as [giftSubscription], no
   * mid-cycle pro-ration) and marks the code consumed. Self-redemption is
   * allowed - a voucher is a portable code, not a targeted gift.
   */
  async redeemVoucher(userId: string, code: string): Promise<RedeemVoucherResult> {
    const voucher = await this.prisma.subscriptionVoucher.findUnique({ where: { code } });
    if (!voucher) {
      throw new NotFoundException('Invalid voucher code.');
    }
    if (voucher.redeemedAt) {
      throw new BadRequestException('This voucher has already been redeemed.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const tier = voucher.tier as PaidSubscriptionTier;

    const [updatedUser, redeemed] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: tier,
          subscriptionExpiresAt: expiresAt,
          subscriptionCanceledAt: null,
          isPremium: true,
        },
      }),
      this.prisma.subscriptionVoucher.update({
        where: { id: voucher.id },
        data: { redeemedAt: now, redeemedById: userId },
      }),
    ]);

    return {
      status: this.toStatus(updatedUser),
      voucher: this.toVoucherView(redeemed),
    };
  }

  private generateVoucherCode(): string {
    return randomBytes(VOUCHER_CODE_LENGTH / 2)
      .toString('hex')
      .toUpperCase();
  }

  private toVoucherView(voucher: {
    code: string;
    tier: string;
    redeemedAt: Date | null;
    redeemedById: string | null;
    createdAt: Date;
  }): SubscriptionVoucherView {
    return {
      code: voucher.code,
      tier: voucher.tier as PaidSubscriptionTier,
      redeemedAt: voucher.redeemedAt ? voucher.redeemedAt.toISOString() : null,
      redeemedByUserId: voucher.redeemedById,
      createdAt: voucher.createdAt.toISOString(),
    };
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
