import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_VAULT_ALBUMS } from './vault.constants';

export interface VaultAlbumView {
  id: string;
  name: string;
  createdAt: string;
  photoIds: string[];
  grantedMatchIds: string[];
}

export interface GrantedVaultAlbumView {
  id: string;
  name: string;
  grantedAt: string;
  photos: { id: string; mediaUrl: string }[];
}

/**
 * "Selective Photo Privacy Controls": groups VaultPhotos into a named
 * album/gallery that the owner can lock/unlock for a whole match in one
 * grant, instead of granting each photo in it individually via
 * VaultService.grantAccess. A photo joins an album via VaultService.addPhoto's
 * optional albumId.
 */
@Injectable()
export class VaultAlbumService {
  constructor(private readonly prisma: PrismaService) {}

  async createAlbum(userId: string, name: string): Promise<VaultAlbumView> {
    const existingCount = await this.prisma.vaultAlbum.count({ where: { ownerId: userId } });
    if (existingCount >= MAX_VAULT_ALBUMS) {
      throw new BadRequestException(`You can only keep up to ${MAX_VAULT_ALBUMS} vault albums.`);
    }

    const album = await this.prisma.vaultAlbum.create({ data: { ownerId: userId, name } });
    return { id: album.id, name: album.name, createdAt: album.createdAt.toISOString(), photoIds: [], grantedMatchIds: [] };
  }

  /** The owner's own management view: every album plus its photos and which matches currently have access. */
  async listMyAlbums(userId: string): Promise<VaultAlbumView[]> {
    const albums = await this.prisma.vaultAlbum.findMany({
      where: { ownerId: userId },
      include: { photos: true, grants: true },
      orderBy: { createdAt: 'desc' },
    });

    return albums.map((album) => ({
      id: album.id,
      name: album.name,
      createdAt: album.createdAt.toISOString(),
      photoIds: album.photos.map((photo) => photo.id),
      grantedMatchIds: album.grants.map((grant) => grant.matchId),
    }));
  }

  /** Deletes the album and its grants; photos in it are kept, just ungrouped. */
  async deleteAlbum(userId: string, albumId: string): Promise<{ deleted: boolean }> {
    const album = await this.getOwnedAlbum(userId, albumId);

    await this.prisma.$transaction([
      this.prisma.vaultAlbumGrant.deleteMany({ where: { vaultAlbumId: album.id } }),
      this.prisma.vaultPhoto.updateMany({ where: { albumId: album.id }, data: { albumId: null } }),
      this.prisma.vaultAlbum.delete({ where: { id: album.id } }),
    ]);

    return { deleted: true };
  }

  /** Grants a specific match's other participant access to every photo in this album. Idempotent. */
  async grantAccess(userId: string, albumId: string, matchId: string): Promise<{ granted: boolean }> {
    const album = await this.getOwnedAlbum(userId, albumId);
    await this.assertMatchParticipant(userId, matchId);

    await this.prisma.vaultAlbumGrant.upsert({
      where: { vaultAlbumId_matchId: { vaultAlbumId: album.id, matchId } },
      create: { vaultAlbumId: album.id, matchId },
      update: {},
    });

    return { granted: true };
  }

  async revokeAccess(userId: string, albumId: string, matchId: string): Promise<{ revoked: boolean }> {
    const album = await this.getOwnedAlbum(userId, albumId);

    const grant = await this.prisma.vaultAlbumGrant.findUnique({
      where: { vaultAlbumId_matchId: { vaultAlbumId: album.id, matchId } },
    });
    if (!grant) {
      throw new BadRequestException('This match does not currently have access to this album.');
    }

    await this.prisma.vaultAlbumGrant.delete({ where: { id: grant.id } });
    return { revoked: true };
  }

  /** What the *other* side of a match currently sees: albums their match partner has granted them. */
  async listGrantedAlbums(userId: string, matchId: string): Promise<GrantedVaultAlbumView[]> {
    const otherUserId = await this.assertMatchParticipant(userId, matchId);

    const grants = await this.prisma.vaultAlbumGrant.findMany({
      where: { matchId, vaultAlbum: { ownerId: otherUserId } },
      include: { vaultAlbum: { include: { photos: true } } },
      orderBy: { grantedAt: 'desc' },
    });

    return grants.map((grant) => ({
      id: grant.vaultAlbum.id,
      name: grant.vaultAlbum.name,
      grantedAt: grant.grantedAt.toISOString(),
      photos: grant.vaultAlbum.photos.map((photo) => ({ id: photo.id, mediaUrl: photo.mediaUrl })),
    }));
  }

  private async getOwnedAlbum(userId: string, albumId: string) {
    const album = await this.prisma.vaultAlbum.findUnique({ where: { id: albumId } });
    if (!album) {
      throw new NotFoundException('Vault album not found.');
    }
    if (album.ownerId !== userId) {
      throw new ForbiddenException('You do not own this vault album.');
    }
    return album;
  }

  /** Returns the other participant's id once membership is confirmed. */
  private async assertMatchParticipant(userId: string, matchId: string): Promise<string> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }
    return match.userAId === userId ? match.userBId : match.userAId;
  }
}
