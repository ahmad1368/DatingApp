import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InstagramClient,
  InstagramMediaItem,
  InstagramTokenExchangeResult,
} from '../interfaces/instagram-client.interface';

const SHORT_LIVED_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const LONG_LIVED_TOKEN_URL = 'https://graph.instagram.com/access_token';
const MEDIA_URL = 'https://graph.instagram.com/me/media';
const SYNCABLE_MEDIA_TYPES = ['IMAGE', 'CAROUSEL_ALBUM'];

interface ShortLivedTokenResponse {
  access_token: string;
  user_id: number;
}

interface LongLivedTokenResponse {
  access_token: string;
  expires_in: number;
}

interface MediaResponse {
  data: Array<{
    id: string;
    media_type: string;
    media_url?: string;
    permalink: string;
    timestamp: string;
  }>;
}

@Injectable()
export class InstagramGraphApiClient implements InstagramClient {
  constructor(private readonly configService: ConfigService) {}

  async exchangeCodeForToken(code: string): Promise<InstagramTokenExchangeResult> {
    const clientId = this.configService.get<string>('INSTAGRAM_CLIENT_ID') ?? '';
    const clientSecret = this.configService.get<string>('INSTAGRAM_CLIENT_SECRET') ?? '';
    const redirectUri = this.configService.get<string>('INSTAGRAM_REDIRECT_URI') ?? '';

    const shortLivedResponse = await fetch(SHORT_LIVED_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!shortLivedResponse.ok) {
      throw new UnauthorizedException('Unable to connect your Instagram account.');
    }
    const shortLived = (await shortLivedResponse.json()) as ShortLivedTokenResponse;

    const longLivedResponse = await fetch(
      `${LONG_LIVED_TOKEN_URL}?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${shortLived.access_token}`,
    );
    if (!longLivedResponse.ok) {
      throw new UnauthorizedException('Unable to connect your Instagram account.');
    }
    const longLived = (await longLivedResponse.json()) as LongLivedTokenResponse;

    return {
      accessToken: longLived.access_token,
      instagramUserId: String(shortLived.user_id),
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
    };
  }

  async fetchRecentMedia(accessToken: string): Promise<InstagramMediaItem[]> {
    const response = await fetch(
      `${MEDIA_URL}?fields=id,media_type,media_url,permalink,timestamp&access_token=${accessToken}`,
    );
    if (!response.ok) {
      throw new UnauthorizedException('Unable to fetch your Instagram photos.');
    }
    const body = (await response.json()) as MediaResponse;

    return body.data
      .filter((item) => SYNCABLE_MEDIA_TYPES.includes(item.media_type) && !!item.media_url)
      .map((item) => ({
        id: item.id,
        mediaUrl: item.media_url as string,
        permalink: item.permalink,
        timestamp: item.timestamp,
      }));
  }
}
