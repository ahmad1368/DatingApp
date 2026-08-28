import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarService } from './avatar.service';
import { AVATAR_STYLES } from './avatar.constants';

const USER_ID = 'user-1';

describe('AvatarService', () => {
  let service: AvatarService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new AvatarService(prisma as unknown as PrismaService);
  });

  describe('getCatalog', () => {
    it('returns the static avatar style catalog', () => {
      expect(service.getCatalog()).toEqual(AVATAR_STYLES);
    });
  });

  describe('getMyAvatar', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMyAvatar(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the current avatar selection', async () => {
      prisma.user.findUnique.mockResolvedValue({
        avatarStyleId: 'cosmic-explorer',
        thirdPartyAvatarUrl: null,
        showAvatarOnProfile: true,
      });

      const result = await service.getMyAvatar(USER_ID);

      expect(result).toEqual({
        avatarStyleId: 'cosmic-explorer',
        thirdPartyAvatarUrl: null,
        showAvatarOnProfile: true,
      });
    });
  });

  describe('selectAvatarStyle', () => {
    it('rejects an unknown avatar style', async () => {
      await expect(service.selectAvatarStyle(USER_ID, 'not-a-real-style')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('selects the style and clears any linked third-party avatar', async () => {
      prisma.user.update.mockResolvedValue({
        avatarStyleId: 'retro-arcade',
        thirdPartyAvatarUrl: null,
        showAvatarOnProfile: true,
      });

      const result = await service.selectAvatarStyle(USER_ID, 'retro-arcade');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { avatarStyleId: 'retro-arcade', thirdPartyAvatarUrl: null },
        select: { avatarStyleId: true, thirdPartyAvatarUrl: true, showAvatarOnProfile: true },
      });
      expect(result.avatarStyleId).toBe('retro-arcade');
    });
  });

  describe('linkThirdPartyAvatar', () => {
    it('links the avatar and clears any selected style', async () => {
      prisma.user.update.mockResolvedValue({
        avatarStyleId: null,
        thirdPartyAvatarUrl: 'https://bitmoji.example.com/mine.png',
        showAvatarOnProfile: true,
      });

      const result = await service.linkThirdPartyAvatar(
        USER_ID,
        'https://bitmoji.example.com/mine.png',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { thirdPartyAvatarUrl: 'https://bitmoji.example.com/mine.png', avatarStyleId: null },
        select: { avatarStyleId: true, thirdPartyAvatarUrl: true, showAvatarOnProfile: true },
      });
      expect(result.thirdPartyAvatarUrl).toBe('https://bitmoji.example.com/mine.png');
    });
  });

  describe('clearAvatar', () => {
    it('clears both the style and the linked avatar', async () => {
      prisma.user.update.mockResolvedValue({
        avatarStyleId: null,
        thirdPartyAvatarUrl: null,
        showAvatarOnProfile: true,
      });

      const result = await service.clearAvatar(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { avatarStyleId: null, thirdPartyAvatarUrl: null },
        select: { avatarStyleId: true, thirdPartyAvatarUrl: true, showAvatarOnProfile: true },
      });
      expect(result).toEqual({ avatarStyleId: null, thirdPartyAvatarUrl: null, showAvatarOnProfile: true });
    });
  });

  describe('setShowAvatarOnProfile', () => {
    it('updates the visibility toggle', async () => {
      prisma.user.update.mockResolvedValue({
        avatarStyleId: 'cosmic-explorer',
        thirdPartyAvatarUrl: null,
        showAvatarOnProfile: false,
      });

      const result = await service.setShowAvatarOnProfile(USER_ID, false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { showAvatarOnProfile: false },
        select: { avatarStyleId: true, thirdPartyAvatarUrl: true, showAvatarOnProfile: true },
      });
      expect(result.showAvatarOnProfile).toBe(false);
    });
  });
});
