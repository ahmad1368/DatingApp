import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from './vault.service';

const OWNER_ID = 'owner-1';
const OTHER_ID = 'other-1';
const PHOTO_ID = 'photo-1';
const MATCH_ID = 'match-1';

describe('VaultService', () => {
  let service: VaultService;
  let prisma: {
    vaultPhoto: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
    vaultPhotoGrant: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    match: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      vaultPhoto: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      vaultPhotoGrant: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      match: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new VaultService(prisma as unknown as PrismaService);
  });

  describe('addPhoto', () => {
    it('rejects adding beyond the max vault size', async () => {
      prisma.vaultPhoto.count.mockResolvedValue(20);

      await expect(service.addPhoto(OWNER_ID, 'https://example.com/a.jpg')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.vaultPhoto.create).not.toHaveBeenCalled();
    });

    it('creates a photo with no grants yet', async () => {
      prisma.vaultPhoto.count.mockResolvedValue(0);
      prisma.vaultPhoto.create.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');

      expect(prisma.vaultPhoto.create).toHaveBeenCalledWith({
        data: { ownerId: OWNER_ID, mediaUrl: 'https://example.com/a.jpg' },
      });
      expect(result.grantedMatchIds).toEqual([]);
    });
  });

  describe('listMyPhotos', () => {
    it('includes which matches currently have access to each photo', async () => {
      prisma.vaultPhoto.findMany.mockResolvedValue([
        {
          id: PHOTO_ID,
          mediaUrl: 'https://example.com/a.jpg',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          grants: [{ matchId: MATCH_ID }],
        },
      ]);

      const result = await service.listMyPhotos(OWNER_ID);

      expect(result).toEqual([
        {
          id: PHOTO_ID,
          mediaUrl: 'https://example.com/a.jpg',
          createdAt: '2026-01-01T00:00:00.000Z',
          grantedMatchIds: [MATCH_ID],
        },
      ]);
    });
  });

  describe('deletePhoto', () => {
    it('throws when the photo does not exist', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue(null);

      await expect(service.deletePhoto(OWNER_ID, PHOTO_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects deleting a photo owned by someone else', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OTHER_ID });

      await expect(service.deletePhoto(OWNER_ID, PHOTO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('deletes the grants and the photo together', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });

      const result = await service.deletePhoto(OWNER_ID, PHOTO_ID);

      expect(prisma.vaultPhotoGrant.deleteMany).toHaveBeenCalledWith({
        where: { vaultPhotoId: PHOTO_ID },
      });
      expect(prisma.vaultPhoto.delete).toHaveBeenCalledWith({ where: { id: PHOTO_ID } });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('grantAccess', () => {
    it('rejects granting access to a photo you do not own', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OTHER_ID });

      await expect(service.grantAccess(OWNER_ID, PHOTO_ID, MATCH_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects granting access for a match the owner is not part of', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.match.findUnique.mockResolvedValue({ userAId: 'someone', userBId: 'else' });

      await expect(service.grantAccess(OWNER_ID, PHOTO_ID, MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('upserts the grant so re-granting is a no-op', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.match.findUnique.mockResolvedValue({ userAId: OWNER_ID, userBId: OTHER_ID });

      const result = await service.grantAccess(OWNER_ID, PHOTO_ID, MATCH_ID);

      expect(prisma.vaultPhotoGrant.upsert).toHaveBeenCalledWith({
        where: { vaultPhotoId_matchId: { vaultPhotoId: PHOTO_ID, matchId: MATCH_ID } },
        create: { vaultPhotoId: PHOTO_ID, matchId: MATCH_ID },
        update: {},
      });
      expect(result).toEqual({ granted: true });
    });
  });

  describe('revokeAccess', () => {
    it('rejects when there is no existing grant to revoke', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.vaultPhotoGrant.findUnique.mockResolvedValue(null);

      await expect(service.revokeAccess(OWNER_ID, PHOTO_ID, MATCH_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('deletes the grant', async () => {
      prisma.vaultPhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.vaultPhotoGrant.findUnique.mockResolvedValue({ id: 'grant-1' });

      const result = await service.revokeAccess(OWNER_ID, PHOTO_ID, MATCH_ID);

      expect(prisma.vaultPhotoGrant.delete).toHaveBeenCalledWith({ where: { id: 'grant-1' } });
      expect(result).toEqual({ revoked: true });
    });
  });

  describe('listGrantedPhotos', () => {
    it('throws when the user is not part of the match', async () => {
      prisma.match.findUnique.mockResolvedValue({ userAId: 'someone', userBId: 'else' });

      await expect(service.listGrantedPhotos(OWNER_ID, MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lists only the match partner's granted photos", async () => {
      prisma.match.findUnique.mockResolvedValue({ userAId: OWNER_ID, userBId: OTHER_ID });
      prisma.vaultPhotoGrant.findMany.mockResolvedValue([
        {
          vaultPhoto: { id: PHOTO_ID, mediaUrl: 'https://example.com/a.jpg' },
          grantedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);

      const result = await service.listGrantedPhotos(OWNER_ID, MATCH_ID);

      expect(prisma.vaultPhotoGrant.findMany).toHaveBeenCalledWith({
        where: { matchId: MATCH_ID, vaultPhoto: { ownerId: OTHER_ID } },
        include: { vaultPhoto: true },
        orderBy: { grantedAt: 'desc' },
      });
      expect(result).toEqual([
        { id: PHOTO_ID, mediaUrl: 'https://example.com/a.jpg', grantedAt: '2026-01-02T00:00:00.000Z' },
      ]);
    });
  });
});
