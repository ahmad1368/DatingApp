import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeBoostExpiresAt } from '../discovery/discovery.constants';
import { findPowerUp, POWER_UPS, PowerUp } from './power-ups.constants';

export interface PurchasePowerUpResult {
  coinBalance: number;
  powerUpId: string;
}

/**
 * One-time, coin-purchased perks (boost, extra super like) that work
 * without a subscription - spent from the same shared coin balance as
 * gifting/live-streaming tips and wallet top-ups (see WalletService).
 */
@Injectable()
export class PowerUpsService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): PowerUp[] {
    return POWER_UPS;
  }

  async purchasePowerUp(userId: string, powerUpId: string): Promise<PurchasePowerUpResult> {
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

    if (powerUp.id === 'boost') {
      return this.purchaseBoost(userId, powerUp);
    }
    return this.purchaseSuperLike(userId, powerUp);
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
}
