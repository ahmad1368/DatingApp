import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const USER_ID = 'user-1';
const RECIPIENT_ID = 'user-2';

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    subscriptionGift: { create: jest.Mock; findMany: jest.Mock };
    subscriptionVoucher: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      subscriptionGift: { create: jest.fn(), findMany: jest.fn() },
      subscriptionVoucher: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new SubscriptionsService(prisma as unknown as PrismaService);
  });

  describe('getCatalog', () => {
    it('includes the free tier and all three paid tiers', () => {
      const catalog = service.getCatalog();

      expect(catalog.map((plan) => plan.tier)).toEqual(['FREE', 'PLUS', 'GOLD', 'PLATINUM']);
    });
  });

  describe('getStatus', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getStatus(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports the free tier as inactive with no expiry', async () => {
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
        subscriptionCanceledAt: null,
        isPremium: false,
      });

      const status = await service.getStatus(USER_ID);

      expect(status).toEqual({ tier: 'FREE', isActive: false, expiresAt: null, canceledAt: null });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('reports an unexpired paid tier as active', async () => {
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'GOLD',
        subscriptionExpiresAt: hoursFromNow(24),
        subscriptionCanceledAt: null,
        isPremium: true,
      });

      const status = await service.getStatus(USER_ID);

      expect(status.tier).toBe('GOLD');
      expect(status.isActive).toBe(true);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lazily downgrades and self-heals isPremium once a paid tier has lapsed', async () => {
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'PLUS',
        subscriptionExpiresAt: hoursFromNow(-1),
        subscriptionCanceledAt: null,
        isPremium: true,
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
        subscriptionCanceledAt: null,
        isPremium: false,
      });

      const status = await service.getStatus(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { subscriptionTier: 'FREE', subscriptionExpiresAt: null, isPremium: false },
      });
      expect(status).toEqual({ tier: 'FREE', isActive: false, expiresAt: null, canceledAt: null });
    });
  });

  describe('subscribe', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.subscribe(USER_ID, 'PLATINUM')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('activates the tier for one billing period when subscribing from free', async () => {
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'PLATINUM',
        subscriptionExpiresAt: hoursFromNow(30 * 24),
        subscriptionCanceledAt: null,
        isPremium: true,
      });

      const status = await service.subscribe(USER_ID, 'PLATINUM');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          subscriptionTier: 'PLATINUM',
          subscriptionExpiresAt: expect.any(Date),
          subscriptionCanceledAt: null,
          isPremium: true,
        },
      });
      expect(status.tier).toBe('PLATINUM');
      expect(status.isActive).toBe(true);
    });

    it('carries pro-rated bonus time forward on a mid-cycle upgrade', async () => {
      // 15 days left on GOLD ($19.99/mo); upgrading to PLATINUM ($29.99/mo)
      // should add roughly 15 * (19.99/29.99) ~= 10 bonus days on top of the
      // fresh 30-day period.
      const now = new Date('2026-01-01T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'GOLD',
        subscriptionExpiresAt: new Date('2026-01-16T00:00:00.000Z'),
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'PLATINUM',
        subscriptionExpiresAt: hoursFromNow(30 * 24),
        subscriptionCanceledAt: null,
        isPremium: true,
      });

      await service.subscribe(USER_ID, 'PLATINUM');

      const call = prisma.user.update.mock.calls[0][0];
      const expiresAt = call.data.subscriptionExpiresAt as Date;
      const daysGranted = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysGranted).toBeGreaterThan(30);
      expect(daysGranted).toBeCloseTo(40, 0);
      jest.useRealTimers();
    });

    it('does not add bonus time when downgrading mid-cycle', async () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'PLATINUM',
        subscriptionExpiresAt: new Date('2026-01-16T00:00:00.000Z'),
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'GOLD',
        subscriptionExpiresAt: hoursFromNow(30 * 24),
        subscriptionCanceledAt: null,
        isPremium: true,
      });

      await service.subscribe(USER_ID, 'GOLD');

      const call = prisma.user.update.mock.calls[0][0];
      const expiresAt = call.data.subscriptionExpiresAt as Date;
      const daysGranted = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysGranted).toBeCloseTo(30, 5);
      jest.useRealTimers();
    });
  });

  describe('cancel', () => {
    it('rejects canceling when already on the free tier', async () => {
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
        subscriptionCanceledAt: null,
        isPremium: false,
      });

      await expect(service.cancel(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects canceling a subscription that has already lapsed', async () => {
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'GOLD',
        subscriptionExpiresAt: hoursFromNow(-1),
        subscriptionCanceledAt: null,
        isPremium: true,
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
        subscriptionCanceledAt: null,
        isPremium: false,
      });

      await expect(service.cancel(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reverts an active paid tier to free immediately', async () => {
      prisma.user.findUnique.mockResolvedValue({
        subscriptionTier: 'GOLD',
        subscriptionExpiresAt: hoursFromNow(24),
        subscriptionCanceledAt: null,
        isPremium: true,
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
        subscriptionCanceledAt: new Date('2026-01-01T00:00:00.000Z'),
        isPremium: false,
      });

      const status = await service.cancel(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          subscriptionTier: 'FREE',
          subscriptionExpiresAt: null,
          subscriptionCanceledAt: expect.any(Date),
          isPremium: false,
        },
      });
      expect(status.tier).toBe('FREE');
      expect(status.isActive).toBe(false);
      expect(status.canceledAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('giftSubscription', () => {
    it('rejects gifting a subscription to yourself', async () => {
      await expect(service.giftSubscription(USER_ID, USER_ID, 'GOLD')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when the recipient does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.giftSubscription(USER_ID, RECIPIENT_ID, 'GOLD'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('grants the recipient a fresh billing period of the gifted tier', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: RECIPIENT_ID,
        name: 'Jane',
        profilePhotoUrl: null,
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'GOLD',
        subscriptionExpiresAt: hoursFromNow(30 * 24),
        subscriptionCanceledAt: null,
        isPremium: true,
      });
      prisma.subscriptionGift.create.mockResolvedValue({
        id: 'gift-1',
        tier: 'GOLD',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.giftSubscription(USER_ID, RECIPIENT_ID, 'GOLD');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: {
          subscriptionTier: 'GOLD',
          subscriptionExpiresAt: expect.any(Date),
          subscriptionCanceledAt: null,
          isPremium: true,
        },
      });
      expect(prisma.subscriptionGift.create).toHaveBeenCalledWith({
        data: { senderId: USER_ID, recipientId: RECIPIENT_ID, tier: 'GOLD' },
      });
      expect(result.recipientStatus.tier).toBe('GOLD');
      expect(result.recipientStatus.isActive).toBe(true);
      expect(result.gift).toEqual({
        id: 'gift-1',
        tier: 'GOLD',
        createdAt: '2026-01-01T00:00:00.000Z',
        otherUserId: RECIPIENT_ID,
        otherUserName: 'Jane',
        otherUserPhotoUrl: null,
      });
    });
  });

  describe('listReceivedSubscriptionGifts', () => {
    it('returns an empty list when nobody has gifted a subscription', async () => {
      prisma.subscriptionGift.findMany.mockResolvedValue([]);

      const result = await service.listReceivedSubscriptionGifts(USER_ID);

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('hydrates each gift with the sender\'s name and photo', async () => {
      prisma.subscriptionGift.findMany.mockResolvedValue([
        {
          id: 'gift-1',
          senderId: RECIPIENT_ID,
          recipientId: USER_ID,
          tier: 'PLATINUM',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: RECIPIENT_ID, name: 'Jane', profilePhotoUrl: 'https://example.com/jane.jpg' },
      ]);

      const result = await service.listReceivedSubscriptionGifts(USER_ID);

      expect(result).toEqual([
        {
          id: 'gift-1',
          tier: 'PLATINUM',
          createdAt: '2026-01-01T00:00:00.000Z',
          otherUserId: RECIPIENT_ID,
          otherUserName: 'Jane',
          otherUserPhotoUrl: 'https://example.com/jane.jpg',
        },
      ]);
    });
  });

  describe('purchaseVoucher', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.purchaseVoucher(USER_ID, 'GOLD')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.subscriptionVoucher.create).not.toHaveBeenCalled();
    });

    it('creates a voucher with a generated code for the purchasing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      prisma.subscriptionVoucher.create.mockImplementation(({ data }) =>
        Promise.resolve({
          code: data.code,
          tier: data.tier,
          redeemedAt: null,
          redeemedById: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      const voucher = await service.purchaseVoucher(USER_ID, 'GOLD');

      expect(prisma.subscriptionVoucher.create).toHaveBeenCalledWith({
        data: { code: expect.any(String), tier: 'GOLD', purchasedById: USER_ID },
      });
      expect(voucher.code).toMatch(/^[0-9A-F]+$/);
      expect(voucher.tier).toBe('GOLD');
      expect(voucher.redeemedAt).toBeNull();
      expect(voucher.redeemedByUserId).toBeNull();
      expect(voucher.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('listMyVouchers', () => {
    it("returns the caller's purchased vouchers, most recent first", async () => {
      prisma.subscriptionVoucher.findMany.mockResolvedValue([
        {
          code: 'ABC123',
          tier: 'PLUS',
          redeemedAt: null,
          redeemedById: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.listMyVouchers(USER_ID);

      expect(prisma.subscriptionVoucher.findMany).toHaveBeenCalledWith({
        where: { purchasedById: USER_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([
        {
          code: 'ABC123',
          tier: 'PLUS',
          redeemedAt: null,
          redeemedByUserId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('redeemVoucher', () => {
    it('throws for an invalid code', async () => {
      prisma.subscriptionVoucher.findUnique.mockResolvedValue(null);

      await expect(service.redeemVoucher(USER_ID, 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a voucher that has already been redeemed', async () => {
      prisma.subscriptionVoucher.findUnique.mockResolvedValue({
        id: 'voucher-1',
        code: 'ABC123',
        tier: 'GOLD',
        redeemedAt: new Date('2026-01-01T00:00:00.000Z'),
        redeemedById: RECIPIENT_ID,
      });

      await expect(service.redeemVoucher(USER_ID, 'ABC123')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('grants the caller a fresh billing period and marks the voucher redeemed', async () => {
      prisma.subscriptionVoucher.findUnique.mockResolvedValue({
        id: 'voucher-1',
        code: 'ABC123',
        tier: 'GOLD',
        redeemedAt: null,
        redeemedById: null,
      });
      prisma.user.update.mockResolvedValue({
        subscriptionTier: 'GOLD',
        subscriptionExpiresAt: hoursFromNow(30 * 24),
        subscriptionCanceledAt: null,
        isPremium: true,
      });
      prisma.subscriptionVoucher.update.mockResolvedValue({
        code: 'ABC123',
        tier: 'GOLD',
        redeemedAt: new Date('2026-01-01T00:00:00.000Z'),
        redeemedById: USER_ID,
        createdAt: new Date('2025-12-01T00:00:00.000Z'),
      });

      const result = await service.redeemVoucher(USER_ID, 'ABC123');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          subscriptionTier: 'GOLD',
          subscriptionExpiresAt: expect.any(Date),
          subscriptionCanceledAt: null,
          isPremium: true,
        },
      });
      expect(prisma.subscriptionVoucher.update).toHaveBeenCalledWith({
        where: { id: 'voucher-1' },
        data: { redeemedAt: expect.any(Date), redeemedById: USER_ID },
      });
      expect(result.status.tier).toBe('GOLD');
      expect(result.status.isActive).toBe(true);
      expect(result.voucher.redeemedByUserId).toBe(USER_ID);
      expect(result.voucher.redeemedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });
});
