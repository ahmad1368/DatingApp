import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SPOTIFY_CLIENT, SpotifyClient } from './interfaces/spotify-client.interface';
import { SPOTIFY_AUTHORIZE_URL, SPOTIFY_OAUTH_SCOPE } from './spotify-sync.constants';

export interface SpotifyAnthemView {
  trackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
}

export interface SpotifyConnectionResult {
  connected: boolean;
  topArtists: string[];
  anthem: SpotifyAnthemView | null;
  syncedAt: string | null;
}

interface SpotifyProfileRecord {
  spotifyAccessToken: string | null;
  spotifyRefreshToken: string | null;
  spotifyTokenExpiresAt: Date | null;
  spotifyTopArtists: string[];
  spotifyTopArtistsSyncedAt: Date | null;
  anthemTrackId: string | null;
  anthemTrackName: string | null;
  anthemArtistName: string | null;
  anthemAlbumArtUrl: string | null;
}

@Injectable()
export class SpotifySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(SPOTIFY_CLIENT) private readonly spotifyClient: SpotifyClient,
  ) {}

  getAuthorizeUrl(): string {
    const params = new URLSearchParams({
      client_id: this.configService.get<string>('SPOTIFY_CLIENT_ID') ?? '',
      redirect_uri: this.configService.get<string>('SPOTIFY_REDIRECT_URI') ?? '',
      scope: SPOTIFY_OAUTH_SCOPE,
      response_type: 'code',
    });
    return `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
  }

  async connect(userId: string, code: string): Promise<SpotifyConnectionResult> {
    const tokenResult = await this.spotifyClient.exchangeCodeForToken(code);
    const topArtists = await this.spotifyClient.fetchTopArtists(tokenResult.accessToken);
    const artistNames = topArtists.map((artist) => artist.name);
    const syncedAt = new Date();

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        spotifyUserId: tokenResult.spotifyUserId,
        spotifyAccessToken: tokenResult.accessToken,
        spotifyRefreshToken: tokenResult.refreshToken,
        spotifyTokenExpiresAt: tokenResult.expiresAt,
        spotifyTopArtists: artistNames,
        spotifyTopArtistsSyncedAt: syncedAt,
      },
    });

    return this.toConnectionResult(user);
  }

  async syncTopArtists(userId: string): Promise<SpotifyConnectionResult> {
    const accessToken = await this.getValidAccessToken(userId);
    const topArtists = await this.spotifyClient.fetchTopArtists(accessToken);
    const artistNames = topArtists.map((artist) => artist.name);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { spotifyTopArtists: artistNames, spotifyTopArtistsSyncedAt: new Date() },
    });

    return this.toConnectionResult(user);
  }

  async setAnthem(userId: string, trackId: string): Promise<SpotifyAnthemView> {
    const accessToken = await this.getValidAccessToken(userId);
    const track = await this.spotifyClient.fetchTrack(accessToken, trackId);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        anthemTrackId: track.id,
        anthemTrackName: track.name,
        anthemArtistName: track.artistName,
        anthemAlbumArtUrl: track.albumArtUrl,
      },
    });

    return {
      trackId: track.id,
      trackName: track.name,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
    };
  }

  async clearAnthem(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        anthemTrackId: null,
        anthemTrackName: null,
        anthemArtistName: null,
        anthemAlbumArtUrl: null,
      },
    });
  }

  async getConnection(userId: string): Promise<SpotifyConnectionResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.toConnectionResult(user);
  }

  async disconnect(userId: string): Promise<SpotifyConnectionResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        spotifyUserId: null,
        spotifyAccessToken: null,
        spotifyRefreshToken: null,
        spotifyTokenExpiresAt: null,
        spotifyTopArtists: [],
        spotifyTopArtistsSyncedAt: null,
      },
    });

    return this.toConnectionResult(user);
  }

  private async getValidAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.spotifyAccessToken || !user.spotifyRefreshToken) {
      throw new BadRequestException('Spotify is not connected.');
    }

    const isExpired = !user.spotifyTokenExpiresAt || new Date() > user.spotifyTokenExpiresAt;
    if (!isExpired) {
      return user.spotifyAccessToken;
    }

    const refreshed = await this.spotifyClient.refreshAccessToken(user.spotifyRefreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { spotifyAccessToken: refreshed.accessToken, spotifyTokenExpiresAt: refreshed.expiresAt },
    });

    return refreshed.accessToken;
  }

  private toConnectionResult(user: SpotifyProfileRecord | null): SpotifyConnectionResult {
    return {
      connected: !!user?.spotifyAccessToken,
      topArtists: user?.spotifyTopArtists ?? [],
      anthem: this.toAnthemView(user),
      syncedAt: user?.spotifyTopArtistsSyncedAt ? user.spotifyTopArtistsSyncedAt.toISOString() : null,
    };
  }

  private toAnthemView(user: SpotifyProfileRecord | null): SpotifyAnthemView | null {
    if (!user?.anthemTrackId || !user.anthemTrackName || !user.anthemArtistName) {
      return null;
    }
    return {
      trackId: user.anthemTrackId,
      trackName: user.anthemTrackName,
      artistName: user.anthemArtistName,
      albumArtUrl: user.anthemAlbumArtUrl,
    };
  }
}
