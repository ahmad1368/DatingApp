import { BadRequestException } from '@nestjs/common';
import { GifProvider } from './interfaces/gif-provider.interface';
import { GifSearchService } from './gif-search.service';

describe('GifSearchService', () => {
  let service: GifSearchService;
  let gifProvider: { search: jest.Mock };

  beforeEach(() => {
    gifProvider = { search: jest.fn() };
    service = new GifSearchService(gifProvider as unknown as GifProvider);
  });

  it('rejects an empty query', async () => {
    await expect(service.search('   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(gifProvider.search).not.toHaveBeenCalled();
  });

  it('trims the query and applies the default limit', async () => {
    gifProvider.search.mockResolvedValue([{ id: 'g1', url: 'u1', previewUrl: 'p1' }]);

    const results = await service.search('  cats  ');

    expect(gifProvider.search).toHaveBeenCalledWith('cats', 20);
    expect(results).toHaveLength(1);
  });

  it('caps the limit at the configured maximum', async () => {
    gifProvider.search.mockResolvedValue([]);

    await service.search('cats', 500);

    expect(gifProvider.search).toHaveBeenCalledWith('cats', 50);
  });

  it('ignores a non-positive limit and falls back to the default', async () => {
    gifProvider.search.mockResolvedValue([]);

    await service.search('cats', -5);

    expect(gifProvider.search).toHaveBeenCalledWith('cats', 20);
  });
});
