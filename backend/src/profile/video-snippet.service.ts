import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface VideoSnippetResult {
  url: string | null;
}

/**
 * A short (see VIDEO_SNIPPET_DURATION_SECONDS) looping video clip a user
 * can show instead of a static profile photo. Like the voice intro, this
 * stores whatever url the client hands it - there's no server-side upload
 * or video-processing pipeline in this codebase to validate the clip's
 * actual length against.
 */
@Injectable()
export class VideoSnippetService {
  constructor(private readonly prisma: PrismaService) {}

  async getVideoSnippet(userId: string): Promise<VideoSnippetResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { videoSnippetUrl: true },
    });

    return { url: user?.videoSnippetUrl ?? null };
  }

  async setVideoSnippet(userId: string, url: string): Promise<VideoSnippetResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { videoSnippetUrl: url },
    });

    return { url: user.videoSnippetUrl };
  }

  async clearVideoSnippet(userId: string): Promise<VideoSnippetResult> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { videoSnippetUrl: null },
    });

    return { url: null };
  }
}
