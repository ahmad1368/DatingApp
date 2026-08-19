import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileItemLikeService } from './profile-item-like.service';

const FROM_USER_ID = 'user-1';
const TO_USER_ID = 'user-2';

describe('ProfileItemLikeService', () => {
  let service: ProfileItemLikeService;
  let prisma: {
    user: { findUnique: jest.Mock };
    profileItemLike: { upsert: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      profileItemLike: { upsert: jest.fn(), findMany: jest.fn() },
    };
    service = new ProfileItemLikeService(prisma as unknown as PrismaService);
  });

  describe('likeItem', () => {
    it('rejects liking your own profile item', async () => {
      await expect(
        service.likeItem(FROM_USER_ID, { targetUserId: FROM_USER_ID, itemType: 'PHOTO' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.likeItem(FROM_USER_ID, { targetUserId: TO_USER_ID, itemType: 'PHOTO' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects liking a photo the target user does not have', async () => {
      prisma.user.findUnique.mockResolvedValue({ profilePhotoUrl: null, voiceIntroUrl: null });

      await expect(
        service.likeItem(FROM_USER_ID, { targetUserId: TO_USER_ID, itemType: 'PHOTO' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.profileItemLike.upsert).not.toHaveBeenCalled();
    });

    it('rejects liking a voice memo the target user does not have', async () => {
      prisma.user.findUnique.mockResolvedValue({ profilePhotoUrl: 'photo.jpg', voiceIntroUrl: null });

      await expect(
        service.likeItem(FROM_USER_ID, { targetUserId: TO_USER_ID, itemType: 'VOICE_MEMO' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upserts a like with an optional comment', async () => {
      prisma.user.findUnique.mockResolvedValue({ profilePhotoUrl: 'photo.jpg', voiceIntroUrl: null });
      prisma.profileItemLike.upsert.mockResolvedValue({
        id: 'like-1',
        fromUserId: FROM_USER_ID,
        toUserId: TO_USER_ID,
        itemType: 'PHOTO',
        comment: 'Great shot!',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.likeItem(FROM_USER_ID, {
        targetUserId: TO_USER_ID,
        itemType: 'PHOTO',
        comment: 'Great shot!',
      });

      expect(prisma.profileItemLike.upsert).toHaveBeenCalledWith({
        where: {
          fromUserId_toUserId_itemType: {
            fromUserId: FROM_USER_ID,
            toUserId: TO_USER_ID,
            itemType: 'PHOTO',
          },
        },
        create: {
          fromUserId: FROM_USER_ID,
          toUserId: TO_USER_ID,
          itemType: 'PHOTO',
          comment: 'Great shot!',
        },
        update: { comment: 'Great shot!' },
      });
      expect(result).toEqual({
        id: 'like-1',
        fromUserId: FROM_USER_ID,
        toUserId: TO_USER_ID,
        itemType: 'PHOTO',
        comment: 'Great shot!',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('listReceived', () => {
    it('returns likes received ordered by most recent', async () => {
      prisma.profileItemLike.findMany.mockResolvedValue([
        {
          id: 'like-1',
          fromUserId: FROM_USER_ID,
          toUserId: TO_USER_ID,
          itemType: 'VOICE_MEMO',
          comment: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const likes = await service.listReceived(TO_USER_ID);

      expect(prisma.profileItemLike.findMany).toHaveBeenCalledWith({
        where: { toUserId: TO_USER_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(likes).toEqual([
        {
          id: 'like-1',
          fromUserId: FROM_USER_ID,
          toUserId: TO_USER_ID,
          itemType: 'VOICE_MEMO',
          comment: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });
});
