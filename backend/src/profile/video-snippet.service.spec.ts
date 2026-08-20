import { PrismaService } from '../prisma/prisma.service';
import { VideoSnippetService } from './video-snippet.service';

const USER_ID = 'user-1';

describe('VideoSnippetService', () => {
  let service: VideoSnippetService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new VideoSnippetService(prisma as unknown as PrismaService);
  });

  describe('getVideoSnippet', () => {
    it('returns null when the user has no video snippet set', async () => {
      prisma.user.findUnique.mockResolvedValue({ videoSnippetUrl: null });

      const result = await service.getVideoSnippet(USER_ID);

      expect(result).toEqual({ url: null });
    });

    it('returns the stored video snippet url', async () => {
      prisma.user.findUnique.mockResolvedValue({ videoSnippetUrl: 'file:///tmp/snippet.mp4' });

      const result = await service.getVideoSnippet(USER_ID);

      expect(result).toEqual({ url: 'file:///tmp/snippet.mp4' });
    });
  });

  describe('setVideoSnippet', () => {
    it('persists the url', async () => {
      prisma.user.update.mockResolvedValue({ videoSnippetUrl: 'file:///tmp/snippet.mp4' });

      const result = await service.setVideoSnippet(USER_ID, 'file:///tmp/snippet.mp4');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { videoSnippetUrl: 'file:///tmp/snippet.mp4' },
      });
      expect(result).toEqual({ url: 'file:///tmp/snippet.mp4' });
    });
  });

  describe('clearVideoSnippet', () => {
    it('nulls out the video snippet url', async () => {
      prisma.user.update.mockResolvedValue({});

      const result = await service.clearVideoSnippet(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { videoSnippetUrl: null },
      });
      expect(result).toEqual({ url: null });
    });
  });
});
