import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeBoostExpiresAt } from '../discovery/discovery.constants';
import { computeExtendedExpiresAt } from '../messaging/messaging.constants';
import { EXTRA_DECK_SLOTS_GRANTED, findPowerUp, POWER_UPS, PowerUp } from './power-ups.constants';

export interface PurchasePowerUpResult {
  coinBalance: number;
  powerUpId: string;
}

/**
 * One-time, coin-purchased perks (boost, extra super like, extra profile
 * views, extend match timer) that work without a subscription - spent from
 * the same shared coin balance as gifting/live-streaming tips and wallet
 * top-ups (see WalletService).
 */
@Injectable()
export class PowerUpsService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): PowerUp[] {
    return POWER_UPS;
  }

  async purchasePowerUp(userId: string, powerUpId: string, matchId?: string): Promise<PurchasePowerUpResult> {
    const powerUp = findPowerUp(powerUpId);
    if (!powerUp) {
      throw new BadRequestException('Unknown power-up.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (user.giftTokenBalance < powerUp.coinCost) {
      throw new BadRequestException('Not enough coins for this power-up.');
    }

    switch (powerUp.id) {
      case 'boost':
        return this.purchaseBoost(userId, powerUp);
      case 'extra-profile-views':
        return this.purchaseExtraProfileViews(userId, powerUp);
      case 'extend-match-timer':
        return this.purchaseMatchExtension(userId, powerUp, matchId);
      default:
        return this.purchaseSuperLike(userId, powerUp);
    }
  }

  private async purchaseBoost(userId: string, powerUp: PowerUp): Promise<PurchasePowerUpResult> {
    const existingBoost = await this.prisma.boost.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (existingBoost) {
      throw new BadRequestException('You already have an active boost.');
    }

    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { giftTokenBalance: { decrement: powerUp.coinCost } },
      }),
      this.prisma.boost.create({
        data: { userId, expiresAt: computeBoostExpiresAt(new Date()) },
      }),
    ]);

    return { coinBalance: updatedUser.giftTokenBalance, powerUpId: powerUp.id };
  }

  private async purchaseSuperLike(userId: string, powerUp: PowerUp): Promise<PurchasePowerUpResult> {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        giftTokenBalance: { decrement: powerUp.coinCost },
        bonusSuperLikes: { increment: 1 },
      },
    });

    return { coinBalance: updatedUser.giftTokenBalance, powerUpId: powerUp.id };
  }

  /** Widens the caller's *next* getDeck() fetch by EXTRA_DECK_SLOTS_GRANTED - see DiscoveryService.getDeck. */
  private async purchaseExtraProfileViews(userId: string, powerUp: PowerUp): Promise<PurchasePowerUpResult> {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        giftTokenBalance: { decrement: powerUp.coinCost },
        bonusDeckSlots: { increment: EXTRA_DECK_SLOTS_GRANTED },
      },
    });

    return { coinBalance: updatedUser.giftTokenBalance, powerUpId: powerUp.id };
  }

  /**
   * A paid second (or third, ...) extension for a match that already used
   * its one free extension - see MessagingService.extendMatchTimeLimit for
   * that free path, which this reuses the same expiry math as.
   */
  private async purchaseMatchExtension(
    userId: string,
    powerUp: PowerUp,
    matchId?: string,
  ): Promise<PurchasePowerUpResult> {
    if (!matchId) {
      throw new BadRequestException('A matchId is required to extend a match timer.');
    }

    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }
    if (match.firstMessageSentAt != null) {
      throw new BadRequestException('This match is already unlocked; there is nothing to extend.');
    }
    if (match.firstMessageExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This match has already expired and can no longer be extended.');
    }

    const now = new Date();
    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { giftTokenBalance: { decrement: powerUp.coinCost } },
      }),
      this.prisma.match.update({
        where: { id: matchId },
        data: { firstMessageExpiresAt: computeExtendedExpiresAt(now), firstMessageExtendedAt: now },
      }),
    ]);

    return { coinBalance: updatedUser.giftTokenBalance, powerUpId: powerUp.id };
  }
}
