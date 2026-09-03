import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpotifyArtist,
  SpotifyClient,
  SpotifyRefreshResult,
  SpotifyTokenExchangeResult,
  SpotifyTrack,
} from '../interfaces/spotify-client.interface';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const ME_URL = 'https://api.spotify.com/v1/me';
const TOP_ARTISTS_URL = 'https://api.spotify.com/v1/me/top/artists?limit=10';
const TRACK_URL = 'https://api.spotify.com/v1/tracks';
const SEARCH_URL = 'https://api.spotify.com/v1/search';
const SEARCH_RESULT_LIMIT = 10;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface MeResponse {
  id: string;
}

interface TopArtistsResponse {
  items: Array<{ id: string; name: string }>;
}

interface TrackResponse {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { images: Array<{ url: string }> };
}

interface SearchResponse {
  tracks: { items: TrackResponse[] };
}

@Injectable()
export class SpotifyWebApiClient implements SpotifyClient {
  constructor(private readonly configService: ConfigService) {}

  async exchangeCodeForToken(code: string): Promise<SpotifyTokenExchangeResult> {
    const redirectUri = this.configService.get<string>('SPOTIFY_REDIRECT_URI') ?? '';

    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${this.basicAuthHeader()}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      throw new UnauthorizedException('Unable to connect your Spotify account.');
    }
    const token = (await tokenResponse.json()) as TokenResponse;

    const meResponse = await fetch(ME_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meResponse.ok) {
      throw new UnauthorizedException('Unable to connect your Spotify account.');
    }
    const me = (await meResponse.json()) as MeResponse;

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? '',
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      spotifyUserId: me.id,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<SpotifyRefreshResult> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${this.basicAuthHeader()}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    if (!response.ok) {
      throw new UnauthorizedException('Unable to refresh your Spotify connection.');
    }
    const token = (await response.json()) as TokenResponse;

    return {
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  }

  async fetchTopArtists(accessToken: string): Promise<SpotifyArtist[]> {
    const response = await fetch(TOP_ARTISTS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new UnauthorizedException('Unable to fetch your Spotify top artists.');
    }
    const body = (await response.json()) as TopArtistsResponse;

    return body.items.map((item) => ({ id: item.id, name: item.name }));
  }

  async fetchTrack(accessToken: string, trackId: string): Promise<SpotifyTrack> {
    const response = await fetch(`${TRACK_URL}/${trackId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new UnauthorizedException('Unable to find that Spotify track.');
    }
    const track = (await response.json()) as TrackResponse;

    return {
      id: track.id,
      name: track.name,
      artistName: track.artists.map((artist) => artist.name).join(', '),
      albumArtUrl: track.album.images[0]?.url ?? null,
    };
  }

  async searchTracks(accessToken: string, query: string): Promise<SpotifyTrack[]> {
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: String(SEARCH_RESULT_LIMIT),
    });
    const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new UnauthorizedException('Unable to search Spotify right now.');
    }
    const body = (await response.json()) as SearchResponse;

    return body.tracks.items.map((track) => ({
      id: track.id,
      name: track.name,
      artistName: track.artists.map((artist) => artist.name).join(', '),
      albumArtUrl: track.album.images[0]?.url ?? null,
    }));
  }

  private basicAuthHeader(): string {
    const clientId = this.configService.get<string>('SPOTIFY_CLIENT_ID') ?? '';
    const clientSecret = this.configService.get<string>('SPOTIFY_CLIENT_SECRET') ?? '';
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }
}
