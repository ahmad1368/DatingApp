export const SPOTIFY_CLIENT = Symbol('SPOTIFY_CLIENT');

export interface SpotifyTokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  spotifyUserId: string;
}

export interface SpotifyRefreshResult {
  accessToken: string;
  expiresAt: Date;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artistName: string;
  albumArtUrl: string | null;
}

export interface SpotifyClient {
  exchangeCodeForToken(code: string): Promise<SpotifyTokenExchangeResult>;
  refreshAccessToken(refreshToken: string): Promise<SpotifyRefreshResult>;
  fetchTopArtists(accessToken: string): Promise<SpotifyArtist[]>;
  fetchTrack(accessToken: string, trackId: string): Promise<SpotifyTrack>;
  searchTracks(accessToken: string, query: string): Promise<SpotifyTrack[]>;
}
