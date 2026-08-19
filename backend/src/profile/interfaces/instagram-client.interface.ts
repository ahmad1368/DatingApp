export const INSTAGRAM_CLIENT = Symbol('INSTAGRAM_CLIENT');

export interface InstagramTokenExchangeResult {
  accessToken: string;
  instagramUserId: string;
  expiresAt: Date;
}

export interface InstagramMediaItem {
  id: string;
  mediaUrl: string;
  permalink: string;
  timestamp: string;
}

export interface InstagramClient {
  exchangeCodeForToken(code: string): Promise<InstagramTokenExchangeResult>;
  fetchRecentMedia(accessToken: string): Promise<InstagramMediaItem[]>;
}
