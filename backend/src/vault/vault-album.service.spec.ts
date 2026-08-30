import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VaultAlbumService } from './vault-album.service';

const OWNER_ID = 'owner-1';
const OTHER_ID = 'other-1';
const ALBUM_ID = 'album-1';
const PHOTO_ID = 'photo-1';
const MATCH_ID = 'match-1';

describe('VaultAlbumService', () => {
  let service: VaultAlbumService;
  let prisma: {
    vaultAlbum: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
    vaultAlbumGrant: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    vaultPhoto: { updateMany: jest.Mock };
    match: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      vaultAlbum: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      vaultAlbumGrant: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      vaultPhoto: { updateMany: jest.fn() },
      match: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new VaultAlbumService(prisma as unknown as PrismaService);
  });

  describe('createAlbum', () => {
    it('rejects creating beyond the max album count', async () => {
      prisma.vaultAlbum.count.mockResolvedValue(10);

      await expect(service.createAlbum(OWNER_ID, 'Beach Trip')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.vaultAlbum.create).not.toHaveBeenCalled();
    });

    it('creates an album with no photos or grants yet', async () => {
      prisma.vaultAlbum.count.mockResolvedValue(0);
      prisma.vaultAlbum.create.mockResolvedValue({
        id: ALBUM_ID,
        name: 'Beach Trip',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.createAlbum(OWNER_ID, 'Beach Trip');

      expect(prisma.vaultAlbum.create).toHaveBeenCalledWith({
        data: { ownerId: OWNER_ID, name: 'Beach Trip' },
      });
      expect(result).toEqual({
        id: ALBUM_ID,
        name: 'Beach Trip',
        createdAt: '2026-01-01T00:00:00.000Z',
        photoIds: [],
        grantedMatchIds: [],
      });
    });
  });

  describe('listMyAlbums', () => {
    it('includes photo ids and which matches currently have access', async () => {
      prisma.vaultAlbum.findMany.mockResolvedValue([
        {
          id: ALBUM_ID,
          name: 'Beach Trip',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          photos: [{ id: PHOTO_ID }],
          grants: [{ matchId: MATCH_ID }],
        },
      ]);

      const result = await service.listMyAlbums(OWNER_ID);

      expect(result).toEqual([
        {
          id: ALBUM_ID,
          name: 'Beach Trip',
          createdAt: '2026-01-01T00:00:00.000Z',
          photoIds: [PHOTO_ID],
          grantedMatchIds: [MATCH_ID],
        },
      ]);
    });
  });

  describe('deleteAlbum', () => {
    it('throws when the album does not exist', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue(null);

      await expect(service.deleteAlbum(OWNER_ID, ALBUM_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects deleting an album owned by someone else', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue({ id: ALBUM_ID, ownerId: OTHER_ID });

      await expect(service.deleteAlbum(OWNER_ID, ALBUM_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('deletes the grants, ungroups the photos, and deletes the album', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue({ id: ALBUM_ID, ownerId: OWNER_ID });

      const result = await service.deleteAlbum(OWNER_ID, ALBUM_ID);

      expect(prisma.vaultAlbumGrant.deleteMany).toHaveBeenCalledWith({ where: { vaultAlbumId: ALBUM_ID } });
      expect(prisma.vaultPhoto.updateMany).toHaveBeenCalledWith({
        where: { albumId: ALBUM_ID },
        data: { albumId: null },
      });
      expect(prisma.vaultAlbum.delete).toHaveBeenCalledWith({ where: { id: ALBUM_ID } });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('grantAccess', () => {
    it('rejects granting access to an album you do not own', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue({ id: ALBUM_ID, ownerId: OTHER_ID });

      await expect(service.grantAccess(OWNER_ID, ALBUM_ID, MATCH_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects granting access for a match the owner is not part of', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue({ id: ALBUM_ID, ownerId: OWNER_ID });
      prisma.match.findUnique.mockResolvedValue({ userAId: 'someone', userBId: 'else' });

      await expect(service.grantAccess(OWNER_ID, ALBUM_ID, MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('upserts the grant so re-granting is a no-op', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue({ id: ALBUM_ID, ownerId: OWNER_ID });
      prisma.match.findUnique.mockResolvedValue({ userAId: OWNER_ID, userBId: OTHER_ID });

      const result = await service.grantAccess(OWNER_ID, ALBUM_ID, MATCH_ID);

      expect(prisma.vaultAlbumGrant.upsert).toHaveBeenCalledWith({
        where: { vaultAlbumId_matchId: { vaultAlbumId: ALBUM_ID, matchId: MATCH_ID } },
        create: { vaultAlbumId: ALBUM_ID, matchId: MATCH_ID },
        update: {},
      });
      expect(result).toEqual({ granted: true });
    });
  });

  describe('revokeAccess', () => {
    it('rejects when there is no existing grant to revoke', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue({ id: ALBUM_ID, ownerId: OWNER_ID });
      prisma.vaultAlbumGrant.findUnique.mockResolvedValue(null);

      await expect(service.revokeAccess(OWNER_ID, ALBUM_ID, MATCH_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('deletes the grant', async () => {
      prisma.vaultAlbum.findUnique.mockResolvedValue({ id: ALBUM_ID, ownerId: OWNER_ID });
      prisma.vaultAlbumGrant.findUnique.mockResolvedValue({ id: 'grant-1' });

      const result = await service.revokeAccess(OWNER_ID, ALBUM_ID, MATCH_ID);

      expect(prisma.vaultAlbumGrant.delete).toHaveBeenCalledWith({ where: { id: 'grant-1' } });
      expect(result).toEqual({ revoked: true });
    });
  });

  describe('listGrantedAlbums', () => {
    it('throws when the user is not part of the match', async () => {
      prisma.match.findUnique.mockResolvedValue({ userAId: 'someone', userBId: 'else' });

      await expect(service.listGrantedAlbums(OWNER_ID, MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lists only the match partner's granted albums with their photos", async () => {
      prisma.match.findUnique.mockResolvedValue({ userAId: OWNER_ID, userBId: OTHER_ID });
      prisma.vaultAlbumGrant.findMany.mockResolvedValue([
        {
          vaultAlbum: {
            id: ALBUM_ID,
            name: 'Beach Trip',
            photos: [{ id: PHOTO_ID, mediaUrl: 'https://example.com/a.jpg' }],
          },
          grantedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);

      const result = await service.listGrantedAlbums(OWNER_ID, MATCH_ID);

      expect(prisma.vaultAlbumGrant.findMany).toHaveBeenCalledWith({
        where: { matchId: MATCH_ID, vaultAlbum: { ownerId: OTHER_ID } },
        include: { vaultAlbum: { include: { photos: true } } },
        orderBy: { grantedAt: 'desc' },
      });
      expect(result).toEqual([
        {
          id: ALBUM_ID,
          name: 'Beach Trip',
          grantedAt: '2026-01-02T00:00:00.000Z',
          photos: [{ id: PHOTO_ID, mediaUrl: 'https://example.com/a.jpg' }],
        },
      ]);
    });
  });
});
