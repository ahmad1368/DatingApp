import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  INSTAGRAM_CLIENT,
  InstagramClient,
} from './interfaces/instagram-client.interface';
import { INSTAGRAM_AUTHORIZE_URL, INSTAGRAM_OAUTH_SCOPE } from './instagram-sync.constants';

export interface InstagramConnectionResult {
  connected: boolean;
  mediaUrls: string[];
  syncedAt: string | null;
}

@Injectable()
export class InstagramSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(INSTAGRAM_CLIENT) private readonly instagramClient: InstagramClient,
  ) {}

  getAuthorizeUrl(): string {
    const params = new URLSearchParams({
      client_id: this.configService.get<string>('INSTAGRAM_CLIENT_ID') ?? '',
      redirect_uri: this.configService.get<string>('INSTAGRAM_REDIRECT_URI') ?? '',
      scope: INSTAGRAM_OAUTH_SCOPE,
      response_type: 'code',
    });
    return `${INSTAGRAM_AUTHORIZE_URL}?${params.toString()}`;
  }

  async connect(userId: string, code: string): Promise<InstagramConnectionResult> {
    const tokenResult = await this.instagramClient.exchangeCodeForToken(code);
    const mediaItems = await this.instagramClient.fetchRecentMedia(tokenResult.accessToken);
    const mediaUrls = mediaItems.map((item) => item.mediaUrl);
    const syncedAt = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        instagramUserId: tokenResult.instagramUserId,
        instagramAccessToken: tokenResult.accessToken,
        instagramTokenExpiresAt: tokenResult.expiresAt,
        instagramMediaUrls: mediaUrls,
        instagramSyncedAt: syncedAt,
      },
    });

    return { connected: true, mediaUrls, syncedAt: syncedAt.toISOString() };
  }

  async sync(userId: string): Promise<InstagramConnectionResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.instagramAccessToken) {
      throw new BadRequestException('Instagram is not connected.');
    }

    const mediaItems = await this.instagramClient.fetchRecentMedia(user.instagramAccessToken);
    const mediaUrls = mediaItems.map((item) => item.mediaUrl);
    const syncedAt = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: { instagramMediaUrls: mediaUrls, instagramSyncedAt: syncedAt },
    });

    return { connected: true, mediaUrls, syncedAt: syncedAt.toISOString() };
  }

  async getConnection(userId: string): Promise<InstagramConnectionResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    return {
      connected: !!user?.instagramAccessToken,
      mediaUrls: user?.instagramMediaUrls ?? [],
      syncedAt: user?.instagramSyncedAt ? user.instagramSyncedAt.toISOString() : null,
    };
  }

  async disconnect(userId: string): Promise<InstagramConnectionResult> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        instagramUserId: null,
        instagramAccessToken: null,
        instagramTokenExpiresAt: null,
        instagramMediaUrls: [],
        instagramSyncedAt: null,
      },
    });

    return { connected: false, mediaUrls: [], syncedAt: null };
  }
}
