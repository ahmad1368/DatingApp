import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GiftingService, SendGiftResult } from '../gifting/gifting.service';

export interface LiveStreamView {
  id: string;
  hostId: string;
  title: string;
  status: string;
  viewerCount: number;
  likeCount: number;
  startedAt: string;
  endedAt: string | null;
}

export interface LiveStreamCommentView {
  id: string;
  streamId: string;
  userId: string;
  text: string;
  createdAt: string;
}

interface LiveStreamRecord {
  id: string;
  hostId: string;
  title: string;
  status: string;
  viewerCount: number;
  likeCount: number;
  startedAt: Date;
  endedAt: Date | null;
}

@Injectable()
export class LiveStreamingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly giftingService: GiftingService,
  ) {}

  async startStream(hostId: string, title: string): Promise<LiveStreamView> {
    const existingLive = await this.prisma.liveStream.findFirst({
      where: { hostId, status: 'LIVE' },
    });
    if (existingLive) {
      throw new BadRequestException('You already have an active live stream.');
    }

    const stream = await this.prisma.liveStream.create({ data: { hostId, title } });
    return this.toView(stream);
  }

  async endStream(hostId: string, streamId: string): Promise<LiveStreamView> {
    const stream = await this.getStreamOrThrow(streamId);
    if (stream.hostId !== hostId) {
      throw new ForbiddenException('Only the host can end this stream.');
    }
    if (stream.status !== 'LIVE') {
      throw new BadRequestException('This stream has already ended.');
    }

    const updated = await this.prisma.liveStream.update({
      where: { id: streamId },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    return this.toView(updated);
  }

  async listLiveStreams(): Promise<LiveStreamView[]> {
    const streams = await this.prisma.liveStream.findMany({
      where: { status: 'LIVE' },
      orderBy: { startedAt: 'desc' },
    });
    return streams.map((stream) => this.toView(stream));
  }

  async getStream(streamId: string): Promise<LiveStreamView> {
    const stream = await this.getStreamOrThrow(streamId);
    return this.toView(stream);
  }

  async recordView(streamId: string): Promise<LiveStreamView> {
    const stream = await this.getLiveStreamOrThrow(streamId);
    const updated = await this.prisma.liveStream.update({
      where: { id: stream.id },
      data: { viewerCount: { increment: 1 } },
    });
    return this.toView(updated);
  }

  async likeStream(streamId: string): Promise<LiveStreamView> {
    const stream = await this.getLiveStreamOrThrow(streamId);
    const updated = await this.prisma.liveStream.update({
      where: { id: stream.id },
      data: { likeCount: { increment: 1 } },
    });
    return this.toView(updated);
  }

  async postComment(userId: string, streamId: string, text: string): Promise<LiveStreamCommentView> {
    const stream = await this.getLiveStreamOrThrow(streamId);
    const comment = await this.prisma.liveStreamComment.create({
      data: { streamId: stream.id, userId, text },
    });
    return this.toCommentView(comment);
  }

  async listComments(streamId: string): Promise<LiveStreamCommentView[]> {
    await this.getStreamOrThrow(streamId);
    const comments = await this.prisma.liveStreamComment.findMany({
      where: { streamId },
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((comment) => this.toCommentView(comment));
  }

  /** Viewers gift the host directly, reusing the gifting module's token/balance logic. */
  async sendGift(
    viewerId: string,
    streamId: string,
    giftId: string,
    message?: string,
  ): Promise<SendGiftResult> {
    const stream = await this.getLiveStreamOrThrow(streamId);
    if (stream.hostId === viewerId) {
      throw new BadRequestException('You cannot gift your own stream.');
    }
    return this.giftingService.sendGift(viewerId, stream.hostId, giftId, message);
  }

  private async getStreamOrThrow(streamId: string): Promise<LiveStreamRecord> {
    const stream = await this.prisma.liveStream.findUnique({ where: { id: streamId } });
    if (!stream) {
      throw new NotFoundException('Live stream not found.');
    }
    return stream;
  }

  private async getLiveStreamOrThrow(streamId: string): Promise<LiveStreamRecord> {
    const stream = await this.getStreamOrThrow(streamId);
    if (stream.status !== 'LIVE') {
      throw new BadRequestException('This stream is no longer live.');
    }
    return stream;
  }

  private toView(stream: LiveStreamRecord): LiveStreamView {
    return {
      id: stream.id,
      hostId: stream.hostId,
      title: stream.title,
      status: stream.status,
      viewerCount: stream.viewerCount,
      likeCount: stream.likeCount,
      startedAt: stream.startedAt.toISOString(),
      endedAt: stream.endedAt ? stream.endedAt.toISOString() : null,
    };
  }

  private toCommentView(comment: {
    id: string;
    streamId: string;
    userId: string;
    text: string;
    createdAt: Date;
  }): LiveStreamCommentView {
    return {
      id: comment.id,
      streamId: comment.streamId,
      userId: comment.userId,
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
