import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PowerUpsService } from './power-ups.service';
import { POWER_UPS } from './power-ups.constants';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const MATCH_ID = 'match-1';

describe('PowerUpsService', () => {
  let service: PowerUpsService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    boost: { findFirst: jest.Mock; create: jest.Mock };
    match: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      boost: { findFirst: jest.fn(), create: jest.fn() },
      match: { findUnique: jest.fn(), update: jest.fn() },
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

    describe('boost-pack-3', () => {
      it('deducts the discounted bulk price and credits 3 bonus boosts without activating one', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 300 });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 50 });

        const result = await service.purchasePowerUp(USER_ID, 'boost-pack-3');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 250 }, bonusBoosts: { increment: 3 } },
        });
        expect(prisma.boost.create).not.toHaveBeenCalled();
        expect(result).toEqual({ coinBalance: 50, powerUpId: 'boost-pack-3' });
      });
    });

    describe('boost-pack-5', () => {
      it('deducts the discounted bulk price and credits 5 bonus boosts', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 400 });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 25 });

        const result = await service.purchasePowerUp(USER_ID, 'boost-pack-5');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 375 }, bonusBoosts: { increment: 5 } },
        });
        expect(result).toEqual({ coinBalance: 25, powerUpId: 'boost-pack-5' });
      });

      it('rejects when the coin balance is too low for the pack', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });

        await expect(service.purchasePowerUp(USER_ID, 'boost-pack-5')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.user.update).not.toHaveBeenCalled();
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

    describe('super-like-pack-5', () => {
      it('deducts the discounted bulk price and grants 5 bonus super likes', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 10 });

        const result = await service.purchasePowerUp(USER_ID, 'super-like-pack-5');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 90 }, bonusSuperLikes: { increment: 5 } },
        });
        expect(result).toEqual({ coinBalance: 10, powerUpId: 'super-like-pack-5' });
      });
    });

    describe('super-like-pack-10', () => {
      it('deducts the discounted bulk price and grants 10 bonus super likes', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 200 });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 40 });

        const result = await service.purchasePowerUp(USER_ID, 'super-like-pack-10');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 160 }, bonusSuperLikes: { increment: 10 } },
        });
        expect(result).toEqual({ coinBalance: 40, powerUpId: 'super-like-pack-10' });
      });
    });

    describe('super-like-pack-25', () => {
      it('deducts the discounted bulk price and grants 25 bonus super likes', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 400 });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 50 });

        const result = await service.purchasePowerUp(USER_ID, 'super-like-pack-25');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 350 }, bonusSuperLikes: { increment: 25 } },
        });
        expect(result).toEqual({ coinBalance: 50, powerUpId: 'super-like-pack-25' });
      });

      it('rejects when the coin balance is too low for the pack', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });

        await expect(
          service.purchasePowerUp(USER_ID, 'super-like-pack-25'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.user.update).not.toHaveBeenCalled();
      });
    });

    describe('unmatch-protection', () => {
      it('deducts coins and enables the protection flag', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100, unmatchProtectionEnabled: false });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 25 });

        const result = await service.purchasePowerUp(USER_ID, 'unmatch-protection');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 75 }, unmatchProtectionEnabled: true },
        });
        expect(result).toEqual({ coinBalance: 25, powerUpId: 'unmatch-protection' });
      });

      it('rejects buying it again once already enabled', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100, unmatchProtectionEnabled: true });

        await expect(service.purchasePowerUp(USER_ID, 'unmatch-protection')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.user.update).not.toHaveBeenCalled();
      });
    });

    describe('extra-profile-views', () => {
      it('deducts coins and grants bonus deck slots', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 50 });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 20 });

        const result = await service.purchasePowerUp(USER_ID, 'extra-profile-views');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 30 }, bonusDeckSlots: { increment: 20 } },
        });
        expect(result).toEqual({ coinBalance: 20, powerUpId: 'extra-profile-views' });
      });
    });

    describe('extend-match-timer', () => {
      it('rejects without a matchId', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });

        await expect(service.purchasePowerUp(USER_ID, 'extend-match-timer')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.match.findUnique).not.toHaveBeenCalled();
      });

      it('throws when the match does not belong to the user', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });
        prisma.match.findUnique.mockResolvedValue({
          id: MATCH_ID,
          userAId: OTHER_USER_ID,
          userBId: 'someone-else',
        });

        await expect(
          service.purchasePowerUp(USER_ID, 'extend-match-timer', MATCH_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('rejects a match that is already unlocked', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });
        prisma.match.findUnique.mockResolvedValue({
          id: MATCH_ID,
          userAId: USER_ID,
          userBId: OTHER_USER_ID,
          firstMessageSentAt: new Date(),
          firstMessageExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });

        await expect(
          service.purchasePowerUp(USER_ID, 'extend-match-timer', MATCH_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('rejects a match that has already expired', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });
        prisma.match.findUnique.mockResolvedValue({
          id: MATCH_ID,
          userAId: USER_ID,
          userBId: OTHER_USER_ID,
          firstMessageSentAt: null,
          firstMessageExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
        });

        await expect(
          service.purchasePowerUp(USER_ID, 'extend-match-timer', MATCH_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('extends the match timer even if the free extension was already used', async () => {
        prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });
        prisma.match.findUnique.mockResolvedValue({
          id: MATCH_ID,
          userAId: USER_ID,
          userBId: OTHER_USER_ID,
          firstMessageSentAt: null,
          firstMessageExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          firstMessageExtendedAt: new Date(),
        });
        prisma.user.update.mockResolvedValue({ giftTokenBalance: 60 });
        prisma.match.update.mockResolvedValue({});

        const result = await service.purchasePowerUp(USER_ID, 'extend-match-timer', MATCH_ID);

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { giftTokenBalance: { decrement: 40 } },
        });
        expect(prisma.match.update).toHaveBeenCalledWith({
          where: { id: MATCH_ID },
          data: { firstMessageExpiresAt: expect.any(Date), firstMessageExtendedAt: expect.any(Date) },
        });
        expect(result).toEqual({ coinBalance: 60, powerUpId: 'extend-match-timer' });
      });
    });
  });

  describe('activateBoost', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.activateBoost(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the user has no bonus boost credits', async () => {
      prisma.user.findUnique.mockResolvedValue({ bonusBoosts: 0 });

      await expect(service.activateBoost(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.boost.create).not.toHaveBeenCalled();
    });

    it('rejects when the user already has an active boost', async () => {
      prisma.user.findUnique.mockResolvedValue({ bonusBoosts: 3 });
      prisma.boost.findFirst.mockResolvedValue({ id: 'boost-1' });

      await expect(service.activateBoost(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.boost.create).not.toHaveBeenCalled();
    });

    it('spends one credit and activates a boost', async () => {
      prisma.user.findUnique.mockResolvedValue({ bonusBoosts: 3 });
      prisma.boost.findFirst.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ bonusBoosts: 2 });
      prisma.boost.create.mockResolvedValue({ id: 'boost-1' });

      const result = await service.activateBoost(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { bonusBoosts: { decrement: 1 } },
      });
      expect(prisma.boost.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, expiresAt: expect.any(Date) },
      });
      expect(result.bonusBoosts).toBe(2);
      expect(result.expiresAt).toEqual(expect.any(String));
    });
  });
});
