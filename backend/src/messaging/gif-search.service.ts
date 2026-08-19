import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DEFAULT_GIF_SEARCH_LIMIT, MAX_GIF_SEARCH_LIMIT } from './messaging.constants';
import { GIF_PROVIDER, GifProvider, GifResult } from './interfaces/gif-provider.interface';

@Injectable()
export class GifSearchService {
  constructor(@Inject(GIF_PROVIDER) private readonly gifProvider: GifProvider) {}

  async search(query: string, limit?: number): Promise<GifResult[]> {
    const trimmed = query?.trim();
    if (!trimmed) {
      throw new BadRequestException('A search query is required.');
    }

    const resolvedLimit = Math.min(limit && limit > 0 ? limit : DEFAULT_GIF_SEARCH_LIMIT, MAX_GIF_SEARCH_LIMIT);

    return this.gifProvider.search(trimmed, resolvedLimit);
  }
}
