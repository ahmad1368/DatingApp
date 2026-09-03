import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

export interface SpotifyTrackSearchResult {
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

export interface MusicCompatibilityResult {
  percentage: number | null;
  sharedArtists: string[];
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

  /**
   * Powers both the anthem picker and MessagingService.sendTrackMessage's
   * in-chat song search - requires the caller to have connected their own
   * Spotify account (see getValidAccessToken), same as every other
   * Spotify-backed action in this service.
   */
  async searchTracks(userId: string, query: string): Promise<SpotifyTrackSearchResult[]> {
    if (!query.trim()) {
      throw new BadRequestException('Enter a song or artist to search for.');
    }
    const accessToken = await this.getValidAccessToken(userId);
    const tracks = await this.spotifyClient.searchTracks(accessToken, query);

    return tracks.map((track) => ({
      trackId: track.id,
      trackName: track.name,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
    }));
  }

  /** Looks up one track's details for sharing in chat - see MessagingService.sendTrackMessage. */
  async getTrackForSharing(userId: string, trackId: string): Promise<SpotifyTrackSearchResult> {
    const accessToken = await this.getValidAccessToken(userId);
    const track = await this.spotifyClient.fetchTrack(accessToken, trackId);

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

  /**
   * "Music personality" match: Jaccard similarity over each side's synced
   * top-artist list (there's no genre or listening-habit data from Spotify
   * synced anywhere in this codebase, only top artists - see syncTopArtists).
   * Returns null when either side hasn't connected Spotify yet.
   */
  async getMusicCompatibility(
    userId: string,
    otherUserId: string,
  ): Promise<MusicCompatibilityResult> {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot calculate music compatibility with yourself.');
    }

    const [mine, theirs] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.user.findUnique({ where: { id: otherUserId } }),
    ]);
    if (!theirs) {
      throw new NotFoundException('User not found.');
    }

    const myArtists = mine?.spotifyTopArtists ?? [];
    const theirArtists = theirs.spotifyTopArtists ?? [];
    if (myArtists.length === 0 || theirArtists.length === 0) {
      return { percentage: null, sharedArtists: [] };
    }

    const theirArtistSet = new Set(theirArtists);
    const sharedArtists = myArtists.filter((artist) => theirArtistSet.has(artist));
    const unionSize = new Set([...myArtists, ...theirArtists]).size;

    return {
      percentage: Math.round((sharedArtists.length / unionSize) * 100),
      sharedArtists,
    };
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
