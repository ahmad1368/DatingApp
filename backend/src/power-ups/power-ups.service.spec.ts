import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PowerUpsService } from './power-ups.service';
import { POWER_UPS } from './power-ups.constants';

const USER_ID = 'user-1';

describe('PowerUpsService', () => {
  let service: PowerUpsService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    boost: { findFirst: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      boost: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new PowerUpsService(prisma as unknown as PrismaService);
  });

  describe('getCatalog', () => {
    it('returns the static power-up catalog', () => {
      expect(service.getCatalog()).toEqual(POWER_UPS);
    });
  });

  describe('purchasePowerUp', () => {
    it('rejects an unknown power-up', async () => {
      await expect(service.purchasePowerUp(USER_ID, 'not-a-real-power-up')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.purchasePowerUp(USER_ID, 'boost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the coin balance is too low', async () => {
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 10 });

      await expect(service.purchasePowerUp(USER_ID, 'boost')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    describe('boost', () => {
      it('rejects when the user already has an active boost', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 200 });
        prisma.boost.findFirst.mockResolvedValue({ id: 'boost-1' });

        await expect(service.purchasePowerUp(USER_ID, 'boost')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.boost.create).not.toHaveBeenCalled();
      });

      it('deducts coins and creates a boost', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 200 });
        prisma.boost.findFirst.mockResolvedValue(null);
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 100 });
        prisma.boost.create.mockResolvedValue({ id: 'boost-1' });

        const result = await service.purchasePowerUp(USER_ID, 'boost');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 100 } },
        });
        expect(prisma.boost.create).toHaveBeenCalledWith({
          data: { userId: USER_ID, expiresAt: expect.any(Date) },
        });
        expect(result).toEqual({ coinBalance: 100, powerUpId: 'boost' });
      });
    });

    describe('super-like', () => {
      it('deducts coins and grants a bonus super like', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 50 });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 30 });

        const result = await service.purchasePowerUp(USER_ID, 'super-like');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 20 }, bonusSuperLikes: { increment: 1 } },
        });
        expect(result).toEqual({ coinBalance: 30, powerUpId: 'super-like' });
      });
    });
  });
});
