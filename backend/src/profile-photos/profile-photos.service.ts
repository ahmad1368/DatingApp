import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  LOW_ENGAGEMENT_CONVERSION_THRESHOLD,
  LOW_QUALITY_THRESHOLD,
  MAX_PROFILE_PHOTOS,
  MIN_IMPRESSIONS_FOR_ENGAGEMENT_SIGNAL,
} from './profile-photos.constants';

export interface ProfilePhotoView {
  id: string;
  mediaUrl: string;
  isLead: boolean;
  impressions: number;
  rightSwipes: number;
  conversionRate: number | null;
  qualityScore: number;
  cropFocalX: number;
  cropFocalY: number;
  brightnessAdjustment: number;
  caption: string | null;
}

export interface CropFocalPoint {
  x: number;
  y: number;
}

export type PhotoCurationReason = 'BLURRY' | 'DUPLICATE' | 'LOW_ENGAGEMENT';

export interface PhotoCurationSuggestion {
  photoId: string;
  mediaUrl: string;
  reasons: PhotoCurationReason[];
}

export interface PhotoGalleryCuration {
  suggestedRemovals: PhotoCurationSuggestion[];
  suggestedOrder: string[];
}

/**
 * Stands in for real computer-vision analysis of lighting, facial clarity,
 * and background quality: a deterministic 0-100 score derived from the
 * media URL, so the same photo always scores the same and photos can be
 * ranked before any swipe data exists for them.
 */
function scorePhotoQuality(mediaUrl: string): number {
  const digest = createHash('sha256').update(mediaUrl).digest();
  return digest[0] % 101;
}

const FOCAL_X_RANGE: [number, number] = [0.35, 0.65];
const FOCAL_Y_RANGE: [number, number] = [0.2, 0.5];

/**
 * Stands in for real AI facial detection (no computer-vision library exists
 * in this codebase - see scorePhotoQuality above for the same approach):
 * derives a deterministic focal point from the media URL's hash, biased
 * toward where a face typically sits in a portrait photo (upper-middle), so
 * clients can center-crop this photo consistently across aspect ratios
 * without needing a real detection pipeline wired up yet.
 */
function detectFaceFocalPoint(mediaUrl: string): CropFocalPoint {
  const digest = createHash('sha256').update(mediaUrl).digest();
  const [xMin, xMax] = FOCAL_X_RANGE;
  const [yMin, yMax] = FOCAL_Y_RANGE;
  return {
    x: Number((xMin + (digest[1] / 255) * (xMax - xMin)).toFixed(4)),
    y: Number((yMin + (digest[2] / 255) * (yMax - yMin)).toFixed(4)),
  };
}

const BRIGHTNESS_ADJUSTMENT_RANGE = 30;

/**
 * Stands in for real computer-vision exposure analysis (no such library
 * exists in this codebase - see scorePhotoQuality above for the same
 * approach): a deterministic suggested brightness adjustment in
 * percentage points, derived from the media URL's hash. Negative means
 * "darken", positive means "brighten", 0 means "already well-exposed".
 * Actually adjusting the image is a client-side concern; this only
 * surfaces the suggestion.
 */
function suggestBrightnessAdjustment(mediaUrl: string): number {
  const digest = createHash('sha256').update(mediaUrl).digest();
  return (digest[3] % (2 * BRIGHTNESS_ADJUSTMENT_RANGE + 1)) - BRIGHTNESS_ADJUSTMENT_RANGE;
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

    const focalPoint = detectFaceFocalPoint(mediaUrl);
    const photo = await this.prisma.profilePhoto.create({
      data: {
        ownerId: userId,
        mediaUrl,
        position,
        qualityScore: scorePhotoQuality(mediaUrl),
        cropFocalX: focalPoint.x,
        cropFocalY: focalPoint.y,
        brightnessAdjustment: suggestBrightnessAdjustment(mediaUrl),
      },
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

  /** Sets, changes, or clears (pass null) the context/humor caption shown under this photo. */
  async setPhotoCaption(userId: string, photoId: string, caption: string | null): Promise<ProfilePhotoView> {
    const photo = await this.prisma.profilePhoto.findUnique({ where: { id: photoId } });
    if (!photo) {
      throw new NotFoundException('Profile photo not found.');
    }
    if (photo.ownerId !== userId) {
      throw new ForbiddenException('You do not own this profile photo.');
    }

    const updated = await this.prisma.profilePhoto.update({
      where: { id: photoId },
      data: { caption },
    });

    const leadPhoto = await this.prisma.profilePhoto.findFirst({
      where: { ownerId: userId },
      orderBy: { position: 'asc' },
    });

    return this.toView(updated, leadPhoto?.id === updated.id);
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

  /**
   * AI-suggested reorder: ranks the gallery by qualityScore (highest first)
   * rather than swipe conversion, so a newly-added photo with no impressions
   * yet can still be promoted ahead of older, lower-quality ones.
   */
  async reorderByQuality(userId: string): Promise<ProfilePhotoView[]> {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { ownerId: userId },
      orderBy: [{ qualityScore: 'desc' }, { position: 'asc' }],
    });

    if (photos.length === 0) {
      return [];
    }

    await Promise.all(
      photos.map((photo, index) =>
        this.prisma.profilePhoto.update({ where: { id: photo.id }, data: { position: index } }),
      ),
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { profilePhotoUrl: photos[0].mediaUrl },
    });

    return photos.map((photo, index) => this.toView(photo, index === 0));
  }

  /**
   * Stands in for real computer-vision gallery curation (no such library
   * exists in this codebase - see scorePhotoQuality above for the same
   * approach): flags photos to remove - a low qualityScore stands in for
   * "blurry", a repeated mediaUrl for "duplicate", and a conversion rate
   * well below average once a photo has enough impressions to trust the
   * signal for "low-engagement" - and proposes a best-first order for the
   * whole gallery, ranked the same way as reorderByQuality. Read-only: the
   * caller acts on a suggestion via the existing deletePhoto/reorderByQuality
   * endpoints, so this never mutates anything itself.
   */
  async getCurationSuggestions(userId: string): Promise<PhotoGalleryCuration> {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { ownerId: userId },
      orderBy: { position: 'asc' },
    });

    const seenMediaUrls = new Set<string>();
    const suggestedRemovals: PhotoCurationSuggestion[] = [];

    for (const photo of photos) {
      const reasons: PhotoCurationReason[] = [];

      if (photo.qualityScore < LOW_QUALITY_THRESHOLD) {
        reasons.push('BLURRY');
      }
      if (seenMediaUrls.has(photo.mediaUrl)) {
        reasons.push('DUPLICATE');
      }
      seenMediaUrls.add(photo.mediaUrl);
      if (
        photo.impressions >= MIN_IMPRESSIONS_FOR_ENGAGEMENT_SIGNAL &&
        photo.rightSwipes / photo.impressions < LOW_ENGAGEMENT_CONVERSION_THRESHOLD
      ) {
        reasons.push('LOW_ENGAGEMENT');
      }

      if (reasons.length > 0) {
        suggestedRemovals.push({ photoId: photo.id, mediaUrl: photo.mediaUrl, reasons });
      }
    }

    const suggestedOrder = [...photos]
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .map((photo) => photo.id);

    return { suggestedRemovals, suggestedOrder };
  }

  /**
   * Incognito photo blur: when enabled, DiscoveryService marks this user's
   * photos as blurred for anyone who hasn't matched with them yet
   * (DeckCard.profilePhotoBlurred) - matches always see the clear photo.
   */
  async getBlurUntilMatch(userId: string): Promise<{ blurPhotosUntilMatch: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { blurPhotosUntilMatch: true },
    });
    return { blurPhotosUntilMatch: user?.blurPhotosUntilMatch ?? false };
  }

  async setBlurUntilMatch(userId: string, enabled: boolean): Promise<{ blurPhotosUntilMatch: boolean }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { blurPhotosUntilMatch: enabled },
      select: { blurPhotosUntilMatch: true },
    });
    return { blurPhotosUntilMatch: user.blurPhotosUntilMatch };
  }

  private toView(
    photo: {
      id: string;
      mediaUrl: string;
      impressions: number;
      rightSwipes: number;
      qualityScore: number;
      cropFocalX: number;
      cropFocalY: number;
      brightnessAdjustment: number;
      caption?: string | null;
    },
    isLead: boolean,
  ): ProfilePhotoView {
    return {
      id: photo.id,
      mediaUrl: photo.mediaUrl,
      isLead,
      impressions: photo.impressions,
      rightSwipes: photo.rightSwipes,
      conversionRate: photo.impressions > 0 ? photo.rightSwipes / photo.impressions : null,
      qualityScore: photo.qualityScore,
      cropFocalX: photo.cropFocalX,
      cropFocalY: photo.cropFocalY,
      brightnessAdjustment: photo.brightnessAdjustment,
      caption: photo.caption ?? null,
    };
  }
}
