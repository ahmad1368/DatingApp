import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilePhotosService } from './profile-photos.service';

const OWNER_ID = 'owner-1';
const OTHER_ID = 'other-1';
const PHOTO_ID = 'photo-1';

describe('ProfilePhotosService', () => {
  let service: ProfilePhotosService;
  let prisma: {
    profilePhoto: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: { update: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      profilePhoto: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: { update: jest.fn(), findUnique: jest.fn() },
    };
    service = new ProfilePhotosService(prisma as unknown as PrismaService);
  });

  describe('addPhoto', () => {
    it('rejects adding beyond the max photo count', async () => {
      prisma.profilePhoto.count.mockResolvedValue(9);

      await expect(service.addPhoto(OWNER_ID, 'https://example.com/a.jpg')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.profilePhoto.create).not.toHaveBeenCalled();
    });

    it('creates the first photo at position 0 and syncs profilePhotoUrl', async () => {
      prisma.profilePhoto.count.mockResolvedValue(0);
      prisma.profilePhoto.findFirst.mockResolvedValue(null);
      prisma.profilePhoto.create.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
      });

      const result = await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');

      expect(prisma.profilePhoto.create).toHaveBeenCalledWith({
        data: {
          ownerId: OWNER_ID,
          mediaUrl: 'https://example.com/a.jpg',
          position: 0,
          qualityScore: 39,
          cropFocalX: expect.any(Number),
          cropFocalY: expect.any(Number),
          brightnessAdjustment: expect.any(Number),
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: { profilePhotoUrl: 'https://example.com/a.jpg' },
      });
      expect(result.isLead).toBe(true);
    });

    it('appends subsequent photos after the highest position without touching profilePhotoUrl', async () => {
      prisma.profilePhoto.count.mockResolvedValue(1);
      prisma.profilePhoto.findFirst.mockResolvedValue({ position: 0 });
      prisma.profilePhoto.create.mockResolvedValue({
        id: 'photo-2',
        mediaUrl: 'https://example.com/b.jpg',
        impressions: 0,
        rightSwipes: 0,
      });

      const result = await service.addPhoto(OWNER_ID, 'https://example.com/b.jpg');

      expect(prisma.profilePhoto.create).toHaveBeenCalledWith({
        data: {
          ownerId: OWNER_ID,
          mediaUrl: 'https://example.com/b.jpg',
          position: 1,
          qualityScore: 98,
          cropFocalX: expect.any(Number),
          cropFocalY: expect.any(Number),
          brightnessAdjustment: expect.any(Number),
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result.isLead).toBe(false);
    });

    it('scores the same media URL identically every time', async () => {
      prisma.profilePhoto.count.mockResolvedValue(0);
      prisma.profilePhoto.findFirst.mockResolvedValue(null);
      prisma.profilePhoto.create.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
      });

      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');
      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');

      const [firstCall, secondCall] = prisma.profilePhoto.create.mock.calls;
      expect(firstCall[0].data.qualityScore).toBe(secondCall[0].data.qualityScore);
    });

    it('detects the same focal point for the same media URL every time', async () => {
      prisma.profilePhoto.count.mockResolvedValue(0);
      prisma.profilePhoto.findFirst.mockResolvedValue(null);
      prisma.profilePhoto.create.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
      });

      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');
      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');

      const [firstCall, secondCall] = prisma.profilePhoto.create.mock.calls;
      expect(firstCall[0].data.cropFocalX).toBe(secondCall[0].data.cropFocalX);
      expect(firstCall[0].data.cropFocalY).toBe(secondCall[0].data.cropFocalY);
    });

    it('keeps the focal point within the plausible face region', async () => {
      prisma.profilePhoto.count.mockResolvedValue(0);
      prisma.profilePhoto.findFirst.mockResolvedValue(null);
      prisma.profilePhoto.create.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
      });

      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');

      const { cropFocalX, cropFocalY } = prisma.profilePhoto.create.mock.calls[0][0].data;
      expect(cropFocalX).toBeGreaterThanOrEqual(0.35);
      expect(cropFocalX).toBeLessThanOrEqual(0.65);
      expect(cropFocalY).toBeGreaterThanOrEqual(0.2);
      expect(cropFocalY).toBeLessThanOrEqual(0.5);
    });

    it('suggests the same brightness adjustment for the same media URL every time', async () => {
      prisma.profilePhoto.count.mockResolvedValue(0);
      prisma.profilePhoto.findFirst.mockResolvedValue(null);
      prisma.profilePhoto.create.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
      });

      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');
      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');

      const [firstCall, secondCall] = prisma.profilePhoto.create.mock.calls;
      expect(firstCall[0].data.brightnessAdjustment).toBe(secondCall[0].data.brightnessAdjustment);
    });

    it('keeps the suggested brightness adjustment within +/-30 percentage points', async () => {
      prisma.profilePhoto.count.mockResolvedValue(0);
      prisma.profilePhoto.findFirst.mockResolvedValue(null);
      prisma.profilePhoto.create.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
      });

      await service.addPhoto(OWNER_ID, 'https://example.com/a.jpg');

      const { brightnessAdjustment } = prisma.profilePhoto.create.mock.calls[0][0].data;
      expect(brightnessAdjustment).toBeGreaterThanOrEqual(-30);
      expect(brightnessAdjustment).toBeLessThanOrEqual(30);
    });
  });

  describe('listMyPhotos', () => {
    it('marks the lowest-position photo as the lead and computes conversion rate', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        {
          id: 'lead',
          mediaUrl: 'https://example.com/a.jpg',
          impressions: 10,
          rightSwipes: 4,
          qualityScore: 39,
          cropFocalX: 0.5,
          cropFocalY: 0.35,
        },
        {
          id: 'second',
          mediaUrl: 'https://example.com/b.jpg',
          impressions: 0,
          rightSwipes: 0,
          qualityScore: 98,
          cropFocalX: 0.4,
          cropFocalY: 0.3,
        },
      ]);

      const result = await service.listMyPhotos(OWNER_ID);

      expect(result).toEqual([
        {
          id: 'lead',
          mediaUrl: 'https://example.com/a.jpg',
          isLead: true,
          impressions: 10,
          rightSwipes: 4,
          conversionRate: 0.4,
          qualityScore: 39,
          cropFocalX: 0.5,
          cropFocalY: 0.35,
          caption: null,
        },
        {
          id: 'second',
          mediaUrl: 'https://example.com/b.jpg',
          isLead: false,
          impressions: 0,
          rightSwipes: 0,
          conversionRate: null,
          qualityScore: 98,
          cropFocalX: 0.4,
          cropFocalY: 0.3,
          caption: null,
        },
      ]);
    });
  });

  describe('reorderByQuality', () => {
    it('returns an empty list when the user has no photos', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([]);

      const result = await service.reorderByQuality(OWNER_ID);

      expect(result).toEqual([]);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('re-positions photos by quality score and promotes the top one to lead', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        {
          id: 'high',
          mediaUrl: 'https://example.com/b.jpg',
          impressions: 0,
          rightSwipes: 0,
          qualityScore: 98,
          cropFocalX: 0.4,
          cropFocalY: 0.3,
        },
        {
          id: 'low',
          mediaUrl: 'https://example.com/a.jpg',
          impressions: 10,
          rightSwipes: 4,
          qualityScore: 39,
          cropFocalX: 0.5,
          cropFocalY: 0.35,
        },
      ]);

      const result = await service.reorderByQuality(OWNER_ID);

      expect(prisma.profilePhoto.findMany).toHaveBeenCalledWith({
        where: { ownerId: OWNER_ID },
        orderBy: [{ qualityScore: 'desc' }, { position: 'asc' }],
      });
      expect(prisma.profilePhoto.update).toHaveBeenCalledWith({ where: { id: 'high' }, data: { position: 0 } });
      expect(prisma.profilePhoto.update).toHaveBeenCalledWith({ where: { id: 'low' }, data: { position: 1 } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: { profilePhotoUrl: 'https://example.com/b.jpg' },
      });
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 'high', isLead: true, qualityScore: 98 }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({ id: 'low', isLead: false, qualityScore: 39 }),
      );
    });
  });

  describe('getCurationSuggestions', () => {
    it('returns no suggestions for a small, healthy, distinct gallery', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        {
          id: 'good',
          mediaUrl: 'https://example.com/a.jpg',
          impressions: 5,
          rightSwipes: 4,
          qualityScore: 80,
        },
      ]);

      const result = await service.getCurationSuggestions(OWNER_ID);

      expect(result.suggestedRemovals).toEqual([]);
      expect(result.suggestedOrder).toEqual(['good']);
    });

    it('flags a low quality score as blurry', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        { id: 'blurry', mediaUrl: 'https://example.com/a.jpg', impressions: 0, rightSwipes: 0, qualityScore: 10 },
      ]);

      const result = await service.getCurationSuggestions(OWNER_ID);

      expect(result.suggestedRemovals).toEqual([
        { photoId: 'blurry', mediaUrl: 'https://example.com/a.jpg', reasons: ['BLURRY'] },
      ]);
    });

    it('flags a repeated media URL as a duplicate, keeping the first occurrence clean', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        { id: 'first', mediaUrl: 'https://example.com/a.jpg', impressions: 0, rightSwipes: 0, qualityScore: 80 },
        { id: 'copy', mediaUrl: 'https://example.com/a.jpg', impressions: 0, rightSwipes: 0, qualityScore: 80 },
      ]);

      const result = await service.getCurationSuggestions(OWNER_ID);

      expect(result.suggestedRemovals).toEqual([
        { photoId: 'copy', mediaUrl: 'https://example.com/a.jpg', reasons: ['DUPLICATE'] },
      ]);
    });

    it('flags low engagement only once a photo has enough impressions to trust the signal', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        {
          id: 'too-new',
          mediaUrl: 'https://example.com/a.jpg',
          impressions: 5,
          rightSwipes: 0,
          qualityScore: 80,
        },
        {
          id: 'proven-low',
          mediaUrl: 'https://example.com/b.jpg',
          impressions: 40,
          rightSwipes: 1,
          qualityScore: 80,
        },
      ]);

      const result = await service.getCurationSuggestions(OWNER_ID);

      expect(result.suggestedRemovals).toEqual([
        { photoId: 'proven-low', mediaUrl: 'https://example.com/b.jpg', reasons: ['LOW_ENGAGEMENT'] },
      ]);
    });

    it('can flag a photo for multiple reasons at once', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        { id: 'first', mediaUrl: 'https://example.com/a.jpg', impressions: 0, rightSwipes: 0, qualityScore: 80 },
        { id: 'copy', mediaUrl: 'https://example.com/a.jpg', impressions: 0, rightSwipes: 0, qualityScore: 10 },
      ]);

      const result = await service.getCurationSuggestions(OWNER_ID);

      expect(result.suggestedRemovals).toEqual([
        { photoId: 'copy', mediaUrl: 'https://example.com/a.jpg', reasons: ['BLURRY', 'DUPLICATE'] },
      ]);
    });

    it('proposes a best-first order ranked by quality score, independent of the removal list', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        { id: 'low', mediaUrl: 'https://example.com/a.jpg', impressions: 0, rightSwipes: 0, qualityScore: 20 },
        { id: 'high', mediaUrl: 'https://example.com/b.jpg', impressions: 0, rightSwipes: 0, qualityScore: 90 },
      ]);

      const result = await service.getCurationSuggestions(OWNER_ID);

      expect(result.suggestedOrder).toEqual(['high', 'low']);
    });

    it('does not mutate any photo records - suggestions only', async () => {
      prisma.profilePhoto.findMany.mockResolvedValue([
        { id: 'blurry', mediaUrl: 'https://example.com/a.jpg', impressions: 0, rightSwipes: 0, qualityScore: 10 },
      ]);

      await service.getCurationSuggestions(OWNER_ID);

      expect(prisma.profilePhoto.update).not.toHaveBeenCalled();
      expect(prisma.profilePhoto.delete).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('setPhotoCaption', () => {
    it('throws when the photo does not exist', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue(null);

      await expect(service.setPhotoCaption(OWNER_ID, PHOTO_ID, 'Hi!')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.profilePhoto.update).not.toHaveBeenCalled();
    });

    it('rejects captioning a photo owned by someone else', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OTHER_ID });

      await expect(service.setPhotoCaption(OWNER_ID, PHOTO_ID, 'Hi!')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.profilePhoto.update).not.toHaveBeenCalled();
    });

    it('sets the caption and reports isLead based on current position', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.profilePhoto.update.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
        qualityScore: 39,
        cropFocalX: 0.5,
        cropFocalY: 0.35,
        caption: 'Hiking last summer',
      });
      prisma.profilePhoto.findFirst.mockResolvedValue({ id: PHOTO_ID });

      const result = await service.setPhotoCaption(OWNER_ID, PHOTO_ID, 'Hiking last summer');

      expect(prisma.profilePhoto.update).toHaveBeenCalledWith({
        where: { id: PHOTO_ID },
        data: { caption: 'Hiking last summer' },
      });
      expect(result.caption).toBe('Hiking last summer');
      expect(result.isLead).toBe(true);
    });

    it('clears the caption when passed null', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.profilePhoto.update.mockResolvedValue({
        id: PHOTO_ID,
        mediaUrl: 'https://example.com/a.jpg',
        impressions: 0,
        rightSwipes: 0,
        qualityScore: 39,
        cropFocalX: 0.5,
        cropFocalY: 0.35,
        caption: null,
      });
      prisma.profilePhoto.findFirst.mockResolvedValue({ id: 'other-photo' });

      const result = await service.setPhotoCaption(OWNER_ID, PHOTO_ID, null);

      expect(prisma.profilePhoto.update).toHaveBeenCalledWith({
        where: { id: PHOTO_ID },
        data: { caption: null },
      });
      expect(result.caption).toBeNull();
      expect(result.isLead).toBe(false);
    });
  });

  describe('deletePhoto', () => {
    it('throws when the photo does not exist', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue(null);

      await expect(service.deletePhoto(OWNER_ID, PHOTO_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects deleting a photo owned by someone else', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OTHER_ID });

      await expect(service.deletePhoto(OWNER_ID, PHOTO_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('promotes the next photo to lead and syncs profilePhotoUrl', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.profilePhoto.findFirst.mockResolvedValue({ mediaUrl: 'https://example.com/b.jpg' });

      const result = await service.deletePhoto(OWNER_ID, PHOTO_ID);

      expect(prisma.profilePhoto.delete).toHaveBeenCalledWith({ where: { id: PHOTO_ID } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: { profilePhotoUrl: 'https://example.com/b.jpg' },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('clears profilePhotoUrl when the last photo is deleted', async () => {
      prisma.profilePhoto.findUnique.mockResolvedValue({ id: PHOTO_ID, ownerId: OWNER_ID });
      prisma.profilePhoto.findFirst.mockResolvedValue(null);

      await service.deletePhoto(OWNER_ID, PHOTO_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: { profilePhotoUrl: null },
      });
    });
  });

  describe('getBlurUntilMatch', () => {
    it('defaults to false when the user has nothing set', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getBlurUntilMatch(OWNER_ID);

      expect(result).toEqual({ blurPhotosUntilMatch: false });
    });

    it('returns the stored preference', async () => {
      prisma.user.findUnique.mockResolvedValue({ blurPhotosUntilMatch: true });

      const result = await service.getBlurUntilMatch(OWNER_ID);

      expect(result).toEqual({ blurPhotosUntilMatch: true });
    });
  });

  describe('setBlurUntilMatch', () => {
    it('persists the new preference', async () => {
      prisma.user.update.mockResolvedValue({ blurPhotosUntilMatch: true });

      const result = await service.setBlurUntilMatch(OWNER_ID, true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: { blurPhotosUntilMatch: true },
        select: { blurPhotosUntilMatch: true },
      });
      expect(result).toEqual({ blurPhotosUntilMatch: true });
    });
  });
});
