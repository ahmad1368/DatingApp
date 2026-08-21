import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_PROFILE_PHOTOS } from './profile-photos.constants';

export interface ProfilePhotoView {
  id: string;
  mediaUrl: string;
  isLead: boolean;
  impressions: number;
  rightSwipes: number;
  conversionRate: number | null;
}

/**
 * Manages a user's photo gallery. The lead photo (lowest `position`) is
 * mirrored onto `User.profilePhotoUrl`, which is what the discovery deck
 * actually displays - see DiscoveryService.recordSwipe for the
 * impression/right-swipe tracking and automatic rotation logic that keeps
 * the best-converting photo in the lead slot.
 */
@Injectable()
export class ProfilePhotosService {
  constructor(private readonly prisma: PrismaService) {}

  async addPhoto(userId: string, mediaUrl: string): Promise<ProfilePhotoView> {
    const existingCount = await this.prisma.profilePhoto.count({ where: { ownerId: userId } });
    if (existingCount >= MAX_PROFILE_PHOTOS) {
      throw new BadRequestException(`You can only keep up to ${MAX_PROFILE_PHOTOS} profile photos.`);
    }

    const highestPositioned = await this.prisma.profilePhoto.findFirst({
      where: { ownerId: userId },
      orderBy: { position: 'desc' },
    });
    const position = highestPositioned ? highestPositioned.position + 1 : 0;

    const photo = await this.prisma.profilePhoto.create({
      data: { ownerId: userId, mediaUrl, position },
    });

    if (existingCount === 0) {
      await this.prisma.user.update({ where: { id: userId }, data: { profilePhotoUrl: mediaUrl } });
    }

    return this.toView(photo, position === 0 || existingCount === 0);
  }

  async listMyPhotos(userId: string): Promise<ProfilePhotoView[]> {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { ownerId: userId },
      orderBy: { position: 'asc' },
    });

    return photos.map((photo, index) => this.toView(photo, index === 0));
  }

  async deletePhoto(userId: string, photoId: string): Promise<{ deleted: boolean }> {
    const photo = await this.prisma.profilePhoto.findUnique({ where: { id: photoId } });
    if (!photo) {
      throw new NotFoundException('Profile photo not found.');
    }
    if (photo.ownerId !== userId) {
      throw new ForbiddenException('You do not own this profile photo.');
    }

    await this.prisma.profilePhoto.delete({ where: { id: photoId } });

    const newLead = await this.prisma.profilePhoto.findFirst({
      where: { ownerId: userId },
      orderBy: { position: 'asc' },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { profilePhotoUrl: newLead?.mediaUrl ?? null },
    });

    return { deleted: true };
  }

  private toView(
    photo: { id: string; mediaUrl: string; impressions: number; rightSwipes: number },
    isLead: boolean,
  ): ProfilePhotoView {
    return {
      id: photo.id,
      mediaUrl: photo.mediaUrl,
      isLead,
      impressions: photo.impressions,
      rightSwipes: photo.rightSwipes,
      conversionRate: photo.impressions > 0 ? photo.rightSwipes / photo.impressions : null,
    };
  }
}
