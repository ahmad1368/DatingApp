import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';
import { COIN_PACKAGES } from './wallet.constants';

const USER_ID = 'user-1';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    coinPurchase: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      coinPurchase: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new WalletService(prisma as unknown as PrismaService);
  });

  describe('getCatalog', () => {
    it('returns the static list of coin packages', () => {
      expect(service.getCatalog()).toEqual(COIN_PACKAGES);
    });
  });

  describe('getBalance', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getBalance(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the current coin balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 250 });

      const result = await service.getBalance(USER_ID);

      expect(result).toEqual({ coinBalance: 250 });
    });
  });

  describe('purchaseCoins', () => {
    it('rejects an unknown package', async () => {
      await expect(service.purchaseCoins(USER_ID, 'not-a-real-package')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.purchaseCoins(USER_ID, 'starter')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('credits the coin balance and records the purchase', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, giftTokenBalance: 100 });
      prisma.user.update.mockResolvedValue({ giftTokenBalance: 200 });
      prisma.coinPurchase.create.mockResolvedValue({
        id: 'purchase-1',
        userId: USER_ID,
        packageId: 'starter',
        coinAmount: 100,
        priceUsdCents: 199,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.purchaseCoins(USER_ID, 'starter');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { giftTokenBalance: { increment: 100 } },
      });
      expect(prisma.coinPurchase.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, packageId: 'starter', coinAmount: 100, priceUsdCents: 199 },
      });
      expect(result).toEqual({
        coinBalance: 200,
        purchase: {
          id: 'purchase-1',
          coinPackage: COIN_PACKAGES.find((p) => p.id === 'starter'),
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      });
    });
  });

  describe('listPurchases', () => {
    it('hydrates purchase history with the matching package', async () => {
      prisma.coinPurchase.findMany.mockResolvedValue([
        {
          id: 'purchase-1',
          packageId: 'popular',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.listPurchases(USER_ID);

      expect(result).toEqual([
        {
          id: 'purchase-1',
          coinPackage: COIN_PACKAGES.find((p) => p.id === 'popular'),
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });
});
