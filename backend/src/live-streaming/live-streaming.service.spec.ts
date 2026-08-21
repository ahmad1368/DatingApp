import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GiftingService } from '../gifting/gifting.service';
import { LiveStreamingService } from './live-streaming.service';

const HOST_ID = 'host-1';
const VIEWER_ID = 'viewer-1';
const STREAM_ID = 'stream-1';

const liveStream = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: STREAM_ID,
  hostId: HOST_ID,
  title: 'Q&A tonight',
  status: 'LIVE',
  viewerCount: 0,
  likeCount: 0,
  startedAt: new Date('2026-01-01T00:00:00.000Z'),
  endedAt: null,
  ...overrides,
});

describe('LiveStreamingService', () => {
  let service: LiveStreamingService;
  let prisma: {
    liveStream: { findFirst: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    liveStreamComment: { create: jest.Mock; findMany: jest.Mock };
  };
  let giftingService: { sendGift: jest.Mock };

  beforeEach(() => {
    prisma = {
      liveStream: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      liveStreamComment: { create: jest.fn(), findMany: jest.fn() },
    };
    giftingService = { sendGift: jest.fn() };
    service = new LiveStreamingService(
      prisma as unknown as PrismaService,
      giftingService as unknown as GiftingService,
    );
  });

  describe('startStream', () => {
    it('rejects starting a second stream while one is already live', async () => {
      prisma.liveStream.findFirst.mockResolvedValue(liveStream());

      await expect(service.startStream(HOST_ID, 'Round two')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.liveStream.create).not.toHaveBeenCalled();
    });

    it('creates a live stream', async () => {
      prisma.liveStream.findFirst.mockResolvedValue(null);
      prisma.liveStream.create.mockResolvedValue(liveStream());

      const result = await service.startStream(HOST_ID, 'Q&A tonight');

      expect(prisma.liveStream.create).toHaveBeenCalledWith({
        data: { hostId: HOST_ID, title: 'Q&A tonight' },
      });
      expect(result.status).toBe('LIVE');
    });
  });

  describe('endStream', () => {
    it('throws when the stream does not exist', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(null);

      await expect(service.endStream(HOST_ID, STREAM_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects ending someone else\'s stream', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());

      await expect(service.endStream(VIEWER_ID, STREAM_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects ending an already-ended stream', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream({ status: 'ENDED' }));

      await expect(service.endStream(HOST_ID, STREAM_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('ends the stream', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());
      prisma.liveStream.update.mockResolvedValue(
        liveStream({ status: 'ENDED', endedAt: new Date('2026-01-01T01:00:00.000Z') }),
      );

      const result = await service.endStream(HOST_ID, STREAM_ID);

      expect(prisma.liveStream.update).toHaveBeenCalledWith({
        where: { id: STREAM_ID },
        data: { status: 'ENDED', endedAt: expect.any(Date) },
      });
      expect(result.status).toBe('ENDED');
    });
  });

  describe('recordView / likeStream', () => {
    it('rejects viewing a stream that already ended', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream({ status: 'ENDED' }));

      await expect(service.recordView(STREAM_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('increments the viewer count', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());
      prisma.liveStream.update.mockResolvedValue(liveStream({ viewerCount: 1 }));

      const result = await service.recordView(STREAM_ID);

      expect(prisma.liveStream.update).toHaveBeenCalledWith({
        where: { id: STREAM_ID },
        data: { viewerCount: { increment: 1 } },
      });
      expect(result.viewerCount).toBe(1);
    });

    it('increments the like count', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());
      prisma.liveStream.update.mockResolvedValue(liveStream({ likeCount: 1 }));

      const result = await service.likeStream(STREAM_ID);

      expect(prisma.liveStream.update).toHaveBeenCalledWith({
        where: { id: STREAM_ID },
        data: { likeCount: { increment: 1 } },
      });
      expect(result.likeCount).toBe(1);
    });
  });

  describe('comments', () => {
    it('rejects commenting on a stream that already ended', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream({ status: 'ENDED' }));

      await expect(service.postComment(VIEWER_ID, STREAM_ID, 'hi')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('posts a comment', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());
      prisma.liveStreamComment.create.mockResolvedValue({
        id: 'comment-1',
        streamId: STREAM_ID,
        userId: VIEWER_ID,
        text: 'hi',
        createdAt: new Date('2026-01-01T00:05:00.000Z'),
      });

      const result = await service.postComment(VIEWER_ID, STREAM_ID, 'hi');

      expect(result.text).toBe('hi');
      expect(result.userId).toBe(VIEWER_ID);
    });

    it('lists comments for a stream that exists', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());
      prisma.liveStreamComment.findMany.mockResolvedValue([]);

      await service.listComments(STREAM_ID);

      expect(prisma.liveStreamComment.findMany).toHaveBeenCalledWith({
        where: { streamId: STREAM_ID },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('sendGift', () => {
    it('rejects gifting your own stream', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());

      await expect(service.sendGift(HOST_ID, STREAM_ID, 'rose')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(giftingService.sendGift).not.toHaveBeenCalled();
    });

    it('rejects gifting a stream that already ended', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream({ status: 'ENDED' }));

      await expect(service.sendGift(VIEWER_ID, STREAM_ID, 'rose')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('delegates to the gifting service with the host as recipient', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(liveStream());
      giftingService.sendGift.mockResolvedValue({ tokenBalance: 90, transaction: {} });

      await service.sendGift(VIEWER_ID, STREAM_ID, 'rose', 'nice stream!');

      expect(giftingService.sendGift).toHaveBeenCalledWith(VIEWER_ID, HOST_ID, 'rose', 'nice stream!');
    });
  });
});
