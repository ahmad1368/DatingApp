import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SpotifyClient } from './interfaces/spotify-client.interface';
import { SpotifySyncService } from './spotify-sync.service';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

describe('SpotifySyncService', () => {
  let service: SpotifySyncService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let spotifyClient: {
    exchangeCodeForToken: jest.Mock;
    refreshAccessToken: jest.Mock;
    fetchTopArtists: jest.Mock;
    fetchTrack: jest.Mock;
  };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    spotifyClient = {
      exchangeCodeForToken: jest.fn(),
      refreshAccessToken: jest.fn(),
      fetchTopArtists: jest.fn(),
      fetchTrack: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SPOTIFY_CLIENT_ID: 'client-id',
          SPOTIFY_REDIRECT_URI: 'https://app.example.com/spotify/callback',
        };
        return values[key];
      }),
    };
    service = new SpotifySyncService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
      spotifyClient as unknown as SpotifyClient,
    );
  });

  describe('getAuthorizeUrl', () => {
    it('builds the Spotify authorize URL with client id, redirect, and scope', () => {
      const url = service.getAuthorizeUrl();

      expect(url).toContain('https://accounts.spotify.com/authorize?');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('scope=user-top-read');
    });
  });

  describe('connect', () => {
    it('exchanges the code, syncs top artists, and stores the connection', async () => {
      spotifyClient.exchangeCodeForToken.mockResolvedValue({
        accessToken: 'sp-token',
        refreshToken: 'sp-refresh',
        expiresAt: new Date('2026-03-01T00:00:00.000Z'),
        spotifyUserId: 'sp-user-1',
      });
      spotifyClient.fetchTopArtists.mockResolvedValue([
        { id: 'a1', name: 'Artist One' },
        { id: 'a2', name: 'Artist Two' },
      ]);
      prisma.user.update.mockResolvedValue({
        spotifyAccessToken: 'sp-token',
        spotifyTopArtists: ['Artist One', 'Artist Two'],
        spotifyTopArtistsSyncedAt: new Date('2026-01-01T00:00:00.000Z'),
        anthemTrackId: null,
        anthemTrackName: null,
        anthemArtistName: null,
        anthemAlbumArtUrl: null,
      });

      const result = await service.connect(USER_ID, 'auth-code');

      expect(spotifyClient.exchangeCodeForToken).toHaveBeenCalledWith('auth-code');
      expect(spotifyClient.fetchTopArtists).toHaveBeenCalledWith('sp-token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          spotifyUserId: 'sp-user-1',
          spotifyAccessToken: 'sp-token',
          spotifyRefreshToken: 'sp-refresh',
          spotifyTokenExpiresAt: new Date('2026-03-01T00:00:00.000Z'),
          spotifyTopArtists: ['Artist One', 'Artist Two'],
          spotifyTopArtistsSyncedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        connected: true,
        topArtists: ['Artist One', 'Artist Two'],
        anthem: null,
        syncedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('syncTopArtists', () => {
    it('throws when Spotify is not connected', async () => {
      prisma.user.findUnique.mockResolvedValue({ spotifyAccessToken: null, spotifyRefreshToken: null });

      await expect(service.syncTopArtists(USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(spotifyClient.fetchTopArtists).not.toHaveBeenCalled();
    });

    it('uses the stored access token when it has not expired', async () => {
      prisma.user.findUnique.mockResolvedValue({
        spotifyAccessToken: 'sp-token',
        spotifyRefreshToken: 'sp-refresh',
        spotifyTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      spotifyClient.fetchTopArtists.mockResolvedValue([{ id: 'a1', name: 'Artist One' }]);
      prisma.user.update.mockResolvedValue({
        spotifyAccessToken: 'sp-token',
        spotifyTopArtists: ['Artist One'],
        spotifyTopArtistsSyncedAt: new Date(),
        anthemTrackId: null,
        anthemTrackName: null,
        anthemArtistName: null,
        anthemAlbumArtUrl: null,
      });

      await service.syncTopArtists(USER_ID);

      expect(spotifyClient.refreshAccessToken).not.toHaveBeenCalled();
      expect(spotifyClient.fetchTopArtists).toHaveBeenCalledWith('sp-token');
    });

    it('refreshes the access token when it has expired before syncing', async () => {
      prisma.user.findUnique.mockResolvedValue({
        spotifyAccessToken: 'stale-token',
        spotifyRefreshToken: 'sp-refresh',
        spotifyTokenExpiresAt: new Date(Date.now() - 60 * 1000),
      });
      spotifyClient.refreshAccessToken.mockResolvedValue({
        accessToken: 'fresh-token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      spotifyClient.fetchTopArtists.mockResolvedValue([{ id: 'a1', name: 'Artist One' }]);
      prisma.user.update.mockResolvedValue({
        spotifyAccessToken: 'fresh-token',
        spotifyTopArtists: ['Artist One'],
        spotifyTopArtistsSyncedAt: new Date(),
        anthemTrackId: null,
        anthemTrackName: null,
        anthemArtistName: null,
        anthemAlbumArtUrl: null,
      });

      await service.syncTopArtists(USER_ID);

      expect(spotifyClient.refreshAccessToken).toHaveBeenCalledWith('sp-refresh');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { spotifyAccessToken: 'fresh-token', spotifyTokenExpiresAt: expect.any(Date) },
      });
      expect(spotifyClient.fetchTopArtists).toHaveBeenCalledWith('fresh-token');
    });
  });

  describe('setAnthem', () => {
    it('fetches and stores the chosen track', async () => {
      prisma.user.findUnique.mockResolvedValue({
        spotifyAccessToken: 'sp-token',
        spotifyRefreshToken: 'sp-refresh',
        spotifyTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      spotifyClient.fetchTrack.mockResolvedValue({
        id: 'track-1',
        name: 'Anthem Song',
        artistName: 'Anthem Artist',
        albumArtUrl: 'https://example.com/art.jpg',
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.setAnthem(USER_ID, 'track-1');

      expect(spotifyClient.fetchTrack).toHaveBeenCalledWith('sp-token', 'track-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          anthemTrackId: 'track-1',
          anthemTrackName: 'Anthem Song',
          anthemArtistName: 'Anthem Artist',
          anthemAlbumArtUrl: 'https://example.com/art.jpg',
        },
      });
      expect(result).toEqual({
        trackId: 'track-1',
        trackName: 'Anthem Song',
        artistName: 'Anthem Artist',
        albumArtUrl: 'https://example.com/art.jpg',
      });
    });

    it('throws when Spotify is not connected', async () => {
      prisma.user.findUnique.mockResolvedValue({ spotifyAccessToken: null, spotifyRefreshToken: null });

      await expect(service.setAnthem(USER_ID, 'track-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(spotifyClient.fetchTrack).not.toHaveBeenCalled();
    });
  });

  describe('getConnection', () => {
    it('reports disconnected with no anthem', async () => {
      prisma.user.findUnique.mockResolvedValue({
        spotifyAccessToken: null,
        spotifyTopArtists: [],
        spotifyTopArtistsSyncedAt: null,
        anthemTrackId: null,
        anthemTrackName: null,
        anthemArtistName: null,
        anthemAlbumArtUrl: null,
      });

      const result = await service.getConnection(USER_ID);

      expect(result).toEqual({ connected: false, topArtists: [], anthem: null, syncedAt: null });
    });

    it('reports connected with top artists and an anthem', async () => {
      prisma.user.findUnique.mockResolvedValue({
        spotifyAccessToken: 'sp-token',
        spotifyTopArtists: ['Artist One'],
        spotifyTopArtistsSyncedAt: new Date('2026-01-01T00:00:00.000Z'),
        anthemTrackId: 'track-1',
        anthemTrackName: 'Anthem Song',
        anthemArtistName: 'Anthem Artist',
        anthemAlbumArtUrl: null,
      });

      const result = await service.getConnection(USER_ID);

      expect(result).toEqual({
        connected: true,
        topArtists: ['Artist One'],
        anthem: {
          trackId: 'track-1',
          trackName: 'Anthem Song',
          artistName: 'Anthem Artist',
          albumArtUrl: null,
        },
        syncedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getMusicCompatibility', () => {
    it('rejects comparing a user with themselves', async () => {
      await expect(
        service.getMusicCompatibility(USER_ID, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the other user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ spotifyTopArtists: ['Artist One'] }).mockResolvedValueOnce(null);

      await expect(
        service.getMusicCompatibility(USER_ID, OTHER_USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns null when either user has not synced Spotify top artists', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ spotifyTopArtists: [] })
        .mockResolvedValueOnce({ spotifyTopArtists: ['Artist One'] });

      const result = await service.getMusicCompatibility(USER_ID, OTHER_USER_ID);

      expect(result).toEqual({ percentage: null, sharedArtists: [] });
    });

    it('computes Jaccard similarity over shared top artists', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ spotifyTopArtists: ['Artist One', 'Artist Two', 'Artist Three'] })
        .mockResolvedValueOnce({ spotifyTopArtists: ['Artist Two', 'Artist Three', 'Artist Four'] });

      const result = await service.getMusicCompatibility(USER_ID, OTHER_USER_ID);

      // shared = {Two, Three} (2), union = {One, Two, Three, Four} (4) -> 50%
      expect(result.percentage).toBe(50);
      expect(result.sharedArtists.sort()).toEqual(['Artist Three', 'Artist Two']);
    });
  });

  describe('disconnect', () => {
    it('clears the stored Spotify connection', async () => {
      prisma.user.update.mockResolvedValue({
        spotifyAccessToken: null,
        spotifyTopArtists: [],
        spotifyTopArtistsSyncedAt: null,
        anthemTrackId: null,
        anthemTrackName: null,
        anthemArtistName: null,
        anthemAlbumArtUrl: null,
      });

      const result = await service.disconnect(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          spotifyUserId: null,
          spotifyAccessToken: null,
          spotifyRefreshToken: null,
          spotifyTokenExpiresAt: null,
          spotifyTopArtists: [],
          spotifyTopArtistsSyncedAt: null,
        },
      });
      expect(result.connected).toBe(false);
      expect(result.topArtists).toEqual([]);
    });
  });
});
