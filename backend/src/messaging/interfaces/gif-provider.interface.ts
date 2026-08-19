export const GIF_PROVIDER = Symbol('GIF_PROVIDER');

export interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
}

export interface GifProvider {
  search(query: string, limit: number): Promise<GifResult[]>;
}
