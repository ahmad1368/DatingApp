import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeGrantExpiresAt,
  isGrantExpired,
  MAX_GRANT_EXPIRY_HOURS,
  MAX_VAULT_PHOTOS,
  MIN_GRANT_EXPIRY_HOURS,
} from './vault.constants';

export interface VaultPhotoView {
  id: string;
  mediaUrl: string;
  albumId: string | null;
  createdAt: string;
  grantedMatchIds: string[];
}

export interface GrantedVaultPhotoView {
  id: string;
  mediaUrl: string;
  grantedAt: string;
  expiresAt: string | null;
}

@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  async addPhoto(userId: string, mediaUrl: string, albumId?: string): Promise<VaultPhotoView> {
    const existingCount = await this.prisma.vaultPhoto.count({ where: { ownerId: userId } });
    if (existingCount >= MAX_VAULT_PHOTOS) {
      throw new BadRequestException(`You can only keep up to ${MAX_VAULT_PHOTOS} vault photos.`);
    }

    if (albumId) {
      const album = await this.prisma.vaultAlbum.findUnique({ where: { id: albumId } });
      if (!album || album.ownerId !== userId) {
        throw new NotFoundException('Vault album not found.');
      }
    }

    const photo = await this.prisma.vaultPhoto.create({
      data: { ownerId: userId, mediaUrl, albumId: albumId ?? null },
    });
    return {
      id: photo.id,
      mediaUrl: photo.mediaUrl,
      albumId: photo.albumId,
      createdAt: photo.createdAt.toISOString(),
      grantedMatchIds: [],
    };
  }

  /** The owner's own management view: every vault photo plus which matches currently have access. */
  async listMyPhotos(userId: string): Promise<VaultPhotoView[]> {
    const photos = await this.prisma.vaultPhoto.findMany({
      where: { ownerId: userId },
      include: { grants: true },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return photos.map((photo) => ({
      id: photo.id,
      mediaUrl: photo.mediaUrl,
      albumId: photo.albumId,
      createdAt: photo.createdAt.toISOString(),
      grantedMatchIds: photo.grants
        .filter((grant) => !isGrantExpired(grant.expiresAt, now))
        .map((grant) => grant.matchId),
    }));
  }

  async deletePhoto(userId: string, photoId: string): Promise<{ deleted: boolean }> {
    const photo = await this.getOwnedPhoto(userId, photoId);

    await this.prisma.$transaction([
      this.prisma.vaultPhotoGrant.deleteMany({ where: { vaultPhotoId: photo.id } }),
      this.prisma.vaultPhoto.delete({ where: { id: photo.id } }),
    ]);

    return { deleted: true };
  }

  /**
   * Grants a specific match's other participant access to this photo,
   * either permanently (the default) or as a time-limited key that expires
   * on its own after [expiresInHours] - see isGrantExpired. Idempotent;
   * re-granting replaces any previous expiry with the new one.
   */
  async grantAccess(
    userId: string,
    photoId: string,
    matchId: string,
    expiresInHours?: number,
  ): Promise<{ granted: boolean }> {
    const photo = await this.getOwnedPhoto(userId, photoId);
    await this.assertMatchParticipant(userId, matchId);

    if (expiresInHours != null && (expiresInHours < MIN_GRANT_EXPIRY_HOURS || expiresInHours > MAX_GRANT_EXPIRY_HOURS)) {
      throw new BadRequestException(
        `expiresInHours must be between ${MIN_GRANT_EXPIRY_HOURS} and ${MAX_GRANT_EXPIRY_HOURS}.`,
      );
    }
    const expiresAt = expiresInHours != null ? computeGrantExpiresAt(new Date(), expiresInHours) : null;

    await this.prisma.vaultPhotoGrant.upsert({
      where: { vaultPhotoId_matchId: { vaultPhotoId: photo.id, matchId } },
      create: { vaultPhotoId: photo.id, matchId, expiresAt },
      update: { expiresAt },
    });

    return { granted: true };
  }

  async revokeAccess(userId: string, photoId: string, matchId: string): Promise<{ revoked: boolean }> {
    const photo = await this.getOwnedPhoto(userId, photoId);

    const grant = await this.prisma.vaultPhotoGrant.findUnique({
      where: { vaultPhotoId_matchId: { vaultPhotoId: photo.id, matchId } },
    });
    if (!grant) {
      throw new BadRequestException('This match does not currently have access to this photo.');
    }

    await this.prisma.vaultPhotoGrant.delete({ where: { id: grant.id } });
    return { revoked: true };
  }

  /**
   * What the *other* side of a match currently sees: photos their match
   * partner has granted them, excluding any time-limited key that has
   * expired (see isGrantExpired) - an expired grant still exists in
   * storage until the owner revokes/re-grants it, it's just no longer
   * visible here.
   */
  async listGrantedPhotos(userId: string, matchId: string): Promise<GrantedVaultPhotoView[]> {
    const otherUserId = await this.assertMatchParticipant(userId, matchId);

    const grants = await this.prisma.vaultPhotoGrant.findMany({
      where: { matchId, vaultPhoto: { ownerId: otherUserId } },
      include: { vaultPhoto: true },
      orderBy: { grantedAt: 'desc' },
    });

    const now = new Date();
    return grants
      .filter((grant) => !isGrantExpired(grant.expiresAt, now))
      .map((grant) => ({
        id: grant.vaultPhoto.id,
        mediaUrl: grant.vaultPhoto.mediaUrl,
        grantedAt: grant.grantedAt.toISOString(),
        expiresAt: grant.expiresAt ? grant.expiresAt.toISOString() : null,
      }));
  }

  private async getOwnedPhoto(userId: string, photoId: string) {
    const photo = await this.prisma.vaultPhoto.findUnique({ where: { id: photoId } });
    if (!photo) {
      throw new NotFoundException('Vault photo not found.');
    }
    if (photo.ownerId !== userId) {
      throw new ForbiddenException('You do not own this vault photo.');
    }
    return photo;
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
