import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CoinPackage, COIN_PACKAGES, findCoinPackage } from './wallet.constants';

export interface WalletBalance {
  coinBalance: number;
}

export interface CoinPurchaseView {
  id: string;
  coinPackage: CoinPackage;
  createdAt: string;
}

export interface PurchaseCoinsResult {
  coinBalance: number;
  purchase: CoinPurchaseView;
}

/**
 * The wallet users spend from across the app - a la carte boosts, virtual
 * gifts, and messaging unlocks all draw from the same `giftTokenBalance` on
 * `User` (see gifting.constants.ts). This module owns the credit side:
 * buying coin packages to top the balance up.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): CoinPackage[] {
    return COIN_PACKAGES;
  }

  async getBalance(userId: string): Promise<WalletBalance> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { giftTokenBalance: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return { coinBalance: user.giftTokenBalance };
  }

  async purchaseCoins(userId: string, packageId: string): Promise<PurchaseCoinsResult> {
    const coinPackage = findCoinPackage(packageId);
    if (!coinPackage) {
      throw new BadRequestException('Unknown coin package.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const [updatedUser, purchase] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { giftTokenBalance: { increment: coinPackage.coinAmount } },
      }),
      this.prisma.coinPurchase.create({
        data: {
          userId,
          packageId: coinPackage.id,
          coinAmount: coinPackage.coinAmount,
          priceUsdCents: coinPackage.priceUsdCents,
        },
      }),
    ]);

    return {
      coinBalance: updatedUser.giftTokenBalance,
      purchase: {
        id: purchase.id,
        coinPackage,
        createdAt: purchase.createdAt.toISOString(),
      },
    };
  }

  async listPurchases(userId: string): Promise<CoinPurchaseView[]> {
    const purchases = await this.prisma.coinPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const views: CoinPurchaseView[] = [];
    for (const purchase of purchases) {
      const coinPackage = findCoinPackage(purchase.packageId);
      if (!coinPackage) {
        continue;
      }
      views.push({
        id: purchase.id,
        coinPackage,
        createdAt: purchase.createdAt.toISOString(),
      });
    }
    return views;
  }
}
