import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GiftingService } from './gifting.service';
import { VIRTUAL_GIFTS } from './gifting.constants';

const SENDER_ID = 'user-1';
const RECIPIENT_ID = 'user-2';

describe('GiftingService', () => {
  let service: GiftingService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    giftTransaction: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      giftTransaction: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new GiftingService(prisma as unknown as PrismaService);
  });

  describe('getCatalog', () => {
    it('returns the static list of virtual gifts', () => {
      expect(service.getCatalog()).toEqual(VIRTUAL_GIFTS);
    });
  });

  describe('getBalance', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getBalance(SENDER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the current token balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 100 });

      const result = await service.getBalance(SENDER_ID);

      expect(result).toEqual({ tokenBalance: 100 });
    });
  });

  describe('sendGift', () => {
    it('rejects sending a gift to yourself', async () => {
      await expect(service.sendGift(SENDER_ID, SENDER_ID, 'rose')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an unknown gift', async () => {
      await expect(
        service.sendGift(SENDER_ID, RECIPIENT_ID, 'not-a-real-gift'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the sender does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: RECIPIENT_ID });

      await expect(service.sendGift(SENDER_ID, RECIPIENT_ID, 'rose')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when the recipient does not exist', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: SENDER_ID, giftTokenBalance: 100 })
        .mockResolvedValueOnce(null);

      await expect(service.sendGift(SENDER_ID, RECIPIENT_ID, 'rose')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the sender has an insufficient balance', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: SENDER_ID, giftTokenBalance: 5 })
        .mockResolvedValueOnce({ id: RECIPIENT_ID, name: 'Alex', profilePhotoUrl: null });

      await expect(service.sendGift(SENDER_ID, RECIPIENT_ID, 'rose')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('deducts the token cost and records the transaction', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: SENDER_ID, giftTokenBalance: 100 })
        .mockResolvedValueOnce({ id: RECIPIENT_ID, name: 'Alex', profilePhotoUrl: 'alex.jpg' });
      prisma.user.update.mockResolvedValue({ giftTokenBalance: 90 });
      prisma.giftTransaction.create.mockResolvedValue({
        id: 'gift-1',
        senderId: SENDER_ID,
        recipientId: RECIPIENT_ID,
        giftId: 'rose',
        tokenCost: 10,
        message: 'For you!',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.sendGift(SENDER_ID, RECIPIENT_ID, 'rose', 'For you!');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: SENDER_ID },
        data: { giftTokenBalance: { decrement: 10 } },
      });
      expect(prisma.giftTransaction.create).toHaveBeenCalledWith({
        data: {
          senderId: SENDER_ID,
          recipientId: RECIPIENT_ID,
          giftId: 'rose',
          tokenCost: 10,
          message: 'For you!',
        },
      });
      expect(result).toEqual({
        tokenBalance: 90,
        transaction: {
          id: 'gift-1',
          gift: { id: 'rose', name: 'Rose', emoji: '🌹', tokenCost: 10, animated: false },
          message: 'For you!',
          createdAt: '2026-01-01T00:00:00.000Z',
          otherUserId: RECIPIENT_ID,
          otherUserName: 'Alex',
          otherUserPhotoUrl: 'alex.jpg',
        },
      });
    });
  });

  describe('listReceivedGifts', () => {
    it('returns an empty list without querying users when nothing was received', async () => {
      prisma.giftTransaction.findMany.mockResolvedValue([]);

      const result = await service.listReceivedGifts(RECIPIENT_ID);

      expect(result).toEqual([]);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('hydrates the sender profile info for each received gift', async () => {
      prisma.giftTransaction.findMany.mockResolvedValue([
        {
          id: 'gift-1',
          giftId: 'rose',
          message: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          senderId: SENDER_ID,
          recipientId: RECIPIENT_ID,
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: SENDER_ID, name: 'Jordan', profilePhotoUrl: null },
      ]);

      const result = await service.listReceivedGifts(RECIPIENT_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [SENDER_ID] } },
        select: { id: true, name: true, profilePhotoUrl: true },
      });
      expect(result).toEqual([
        {
          id: 'gift-1',
          gift: { id: 'rose', name: 'Rose', emoji: '🌹', tokenCost: 10, animated: false },
          message: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          otherUserId: SENDER_ID,
          otherUserName: 'Jordan',
          otherUserPhotoUrl: null,
        },
      ]);
    });
  });

  describe('listSentGifts', () => {
    it('groups by the recipient rather than the sender', async () => {
      prisma.giftTransaction.findMany.mockResolvedValue([
        {
          id: 'gift-1',
          giftId: 'coffee',
          message: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          senderId: SENDER_ID,
          recipientId: RECIPIENT_ID,
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: RECIPIENT_ID, name: 'Alex', profilePhotoUrl: null },
      ]);

      const result = await service.listSentGifts(SENDER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [RECIPIENT_ID] } },
        select: { id: true, name: true, profilePhotoUrl: true },
      });
      expect(result[0].otherUserId).toBe(RECIPIENT_ID);
      expect(result[0].otherUserName).toBe('Alex');
    });
  });
});
