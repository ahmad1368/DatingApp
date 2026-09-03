import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileShareService } from './profile-share.service';

const USER_ID = 'user-1';

describe('ProfileShareService', () => {
  let service: ProfileShareService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new ProfileShareService(prisma as unknown as PrismaService);
  });

  describe('getOrCreateShareLink', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getOrCreateShareLink(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mints a new share token and persists it', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, profileShareToken: null });

      const result = await service.getOrCreateShareLink(USER_ID);

      expect(result.shareToken).toEqual(expect.any(String));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { profileShareToken: result.shareToken },
      });
    });

    it('reuses an existing share token instead of minting a new one', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, profileShareToken: 'existing-token' });

      const result = await service.getOrCreateShareLink(USER_ID);

      expect(result).toEqual({ shareToken: 'existing-token' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getSharedProfile', () => {
    it('throws when no user has this share token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getSharedProfile('unknown-token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the public profile card fields', async () => {
      prisma.user.findUnique.mockResolvedValue({
        name: 'Jane',
        dateOfBirth: new Date(new Date().getFullYear() - 28, 0, 1),
        profilePhotoUrl: 'https://example.com/photo.jpg',
        interests: ['Hiking', 'Coffee'],
      });

      const result = await service.getSharedProfile('a-token');

      expect(result).toEqual({
        name: 'Jane',
        age: 28,
        profilePhotoUrl: 'https://example.com/photo.jpg',
        interests: ['Hiking', 'Coffee'],
      });
    });

    it('returns a null age when the profile has no date of birth', async () => {
      prisma.user.findUnique.mockResolvedValue({
        name: 'Jane',
        dateOfBirth: null,
        profilePhotoUrl: null,
        interests: [],
      });

      const result = await service.getSharedProfile('a-token');

      expect(result.age).toBeNull();
    });
  });
});
