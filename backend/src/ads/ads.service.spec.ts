import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AD_CREATIVES } from './ads.constants';
import { AdsService } from './ads.service';

const USER_ID = 'user-1';

describe('AdsService', () => {
  let service: AdsService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    service = new AdsService(prisma as unknown as PrismaService);
  });

  describe('isAdFree', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.isAdFree(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is true for a premium user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });

      await expect(service.isAdFree(USER_ID)).resolves.toBe(true);
    });

    it('is false for a free user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });

      await expect(service.isAdFree(USER_ID)).resolves.toBe(false);
    });
  });

  describe('getEligibility', () => {
    it('wraps ad-free status in a view object', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });

      await expect(service.getEligibility(USER_ID)).resolves.toEqual({ adFree: true });
    });
  });

  describe('getNextAd', () => {
    it('returns null for a premium (ad-free) user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: true });

      await expect(service.getNextAd(USER_ID, 0)).resolves.toBeNull();
    });

    it('returns a creative for a free user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });

      const ad = await service.getNextAd(USER_ID, 0);

      expect(ad).toEqual(AD_CREATIVES[0]);
    });

    it('rotates deterministically by slot index, wrapping around the inventory', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });

      const ad = await service.getNextAd(USER_ID, AD_CREATIVES.length);

      expect(ad).toEqual(AD_CREATIVES[0]);
    });

    it('defaults to the first slot when none is given', async () => {
      prisma.user.findUnique.mockResolvedValue({ isPremium: false });

      const ad = await service.getNextAd(USER_ID);

      expect(ad).toEqual(AD_CREATIVES[0]);
    });
  });
});
