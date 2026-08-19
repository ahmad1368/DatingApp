import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GifProvider, GifResult } from '../interfaces/gif-provider.interface';

const GIPHY_SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';

interface GiphySearchResponse {
  data: Array<{
    id: string;
    images: {
      original: { url: string };
      fixed_width_small: { url: string };
    };
  }>;
}

@Injectable()
export class GiphyClient implements GifProvider {
  constructor(private readonly configService: ConfigService) {}

  async search(query: string, limit: number): Promise<GifResult[]> {
    const apiKey = this.configService.get<string>('GIPHY_API_KEY') ?? '';
    const params = new URLSearchParams({ api_key: apiKey, q: query, limit: String(limit) });

    const response = await fetch(`${GIPHY_SEARCH_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new BadRequestException('Unable to search GIFs right now.');
    }
    const body = (await response.json()) as GiphySearchResponse;

    return body.data.map((item) => ({
      id: item.id,
      url: item.images.original.url,
      previewUrl: item.images.fixed_width_small.url,
    }));
  }
}
