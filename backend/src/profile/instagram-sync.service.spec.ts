import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramClient } from './interfaces/instagram-client.interface';
import { InstagramSyncService } from './instagram-sync.service';

const USER_ID = 'user-1';

describe('InstagramSyncService', () => {
  let service: InstagramSyncService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let instagramClient: { exchangeCodeForToken: jest.Mock; fetchRecentMedia: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    instagramClient = { exchangeCodeForToken: jest.fn(), fetchRecentMedia: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          INSTAGRAM_CLIENT_ID: 'client-id',
          INSTAGRAM_REDIRECT_URI: 'https://app.example.com/instagram/callback',
        };
        return values[key];
      }),
    };
    service = new InstagramSyncService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
      instagramClient as unknown as InstagramClient,
    );
  });

  describe('getAuthorizeUrl', () => {
    it('builds the Instagram authorize URL with client id, redirect, and scope', () => {
      const url = service.getAuthorizeUrl();

      expect(url).toContain('https://api.instagram.com/oauth/authorize?');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('scope=user_profile%2Cuser_media');
      expect(url).toContain('response_type=code');
    });
  });

  describe('connect', () => {
    it('exchanges the code, syncs media, and stores the connection', async () => {
      instagramClient.exchangeCodeForToken.mockResolvedValue({
        accessToken: 'ig-token',
        instagramUserId: 'ig-user-1',
        expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      });
      instagramClient.fetchRecentMedia.mockResolvedValue([
        { id: 'm1', mediaUrl: 'https://example.com/1.jpg', permalink: 'p1', timestamp: 't1' },
        { id: 'm2', mediaUrl: 'https://example.com/2.jpg', permalink: 'p2', timestamp: 't2' },
      ]);
      prisma.user.update.mockResolvedValue({});

      const result = await service.connect(USER_ID, 'auth-code');

      expect(instagramClient.exchangeCodeForToken).toHaveBeenCalledWith('auth-code');
      expect(instagramClient.fetchRecentMedia).toHaveBeenCalledWith('ig-token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          instagramUserId: 'ig-user-1',
          instagramAccessToken: 'ig-token',
          instagramTokenExpiresAt: new Date('2026-03-01T00:00:00.000Z'),
          instagramMediaUrls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
          instagramSyncedAt: expect.any(Date),
        },
      });
      expect(result.connected).toBe(true);
      expect(result.mediaUrls).toEqual(['https://example.com/1.jpg', 'https://example.com/2.jpg']);
    });
  });

  describe('sync', () => {
    it('throws when Instagram is not connected', async () => {
      prisma.user.findUnique.mockResolvedValue({ instagramAccessToken: null });

      await expect(service.sync(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(instagramClient.fetchRecentMedia).not.toHaveBeenCalled();
    });

    it('refreshes the stored media using the saved access token', async () => {
      prisma.user.findUnique.mockResolvedValue({ instagramAccessToken: 'ig-token' });
      instagramClient.fetchRecentMedia.mockResolvedValue([
        { id: 'm3', mediaUrl: 'https://example.com/3.jpg', permalink: 'p3', timestamp: 't3' },
      ]);
      prisma.user.update.mockResolvedValue({});

      const result = await service.sync(USER_ID);

      expect(instagramClient.fetchRecentMedia).toHaveBeenCalledWith('ig-token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { instagramMediaUrls: ['https://example.com/3.jpg'], instagramSyncedAt: expect.any(Date) },
      });
      expect(result.mediaUrls).toEqual(['https://example.com/3.jpg']);
    });
  });

  describe('getConnection', () => {
    it('reports disconnected when there is no access token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        instagramAccessToken: null,
        instagramMediaUrls: [],
        instagramSyncedAt: null,
      });

      const result = await service.getConnection(USER_ID);

      expect(result).toEqual({ connected: false, mediaUrls: [], syncedAt: null });
    });

    it('reports connected with the stored media', async () => {
      prisma.user.findUnique.mockResolvedValue({
        instagramAccessToken: 'ig-token',
        instagramMediaUrls: ['https://example.com/1.jpg'],
        instagramSyncedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.getConnection(USER_ID);

      expect(result).toEqual({
        connected: true,
        mediaUrls: ['https://example.com/1.jpg'],
        syncedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('disconnect', () => {
    it('clears the stored Instagram connection', async () => {
      prisma.user.update.mockResolvedValue({});

      const result = await service.disconnect(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          instagramUserId: null,
          instagramAccessToken: null,
          instagramTokenExpiresAt: null,
          instagramMediaUrls: [],
          instagramSyncedAt: null,
        },
      });
      expect(result).toEqual({ connected: false, mediaUrls: [], syncedAt: null });
    });
  });
});
