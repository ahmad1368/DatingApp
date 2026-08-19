import { PrismaService } from '../prisma/prisma.service';
import { VoiceIntroService } from './voice-intro.service';

const USER_ID = 'user-1';

describe('VoiceIntroService', () => {
  let service: VoiceIntroService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new VoiceIntroService(prisma as unknown as PrismaService);
  });

  describe('getVoiceIntro', () => {
    it('returns nulls when the user has no voice intro set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        voiceIntroUrl: null,
        voiceIntroDurationSeconds: null,
      });

      const result = await service.getVoiceIntro(USER_ID);

      expect(result).toEqual({ url: null, durationSeconds: null });
    });

    it('returns the stored voice intro', async () => {
      prisma.user.findUnique.mockResolvedValue({
        voiceIntroUrl: 'file:///tmp/intro.m4a',
        voiceIntroDurationSeconds: 25,
      });

      const result = await service.getVoiceIntro(USER_ID);

      expect(result).toEqual({ url: 'file:///tmp/intro.m4a', durationSeconds: 25 });
    });
  });

  describe('setVoiceIntro', () => {
    it('persists the url and duration', async () => {
      prisma.user.update.mockResolvedValue({
        voiceIntroUrl: 'file:///tmp/intro.m4a',
        voiceIntroDurationSeconds: 25,
      });

      const result = await service.setVoiceIntro(USER_ID, 'file:///tmp/intro.m4a', 25);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { voiceIntroUrl: 'file:///tmp/intro.m4a', voiceIntroDurationSeconds: 25 },
      });
      expect(result).toEqual({ url: 'file:///tmp/intro.m4a', durationSeconds: 25 });
    });
  });

  describe('clearVoiceIntro', () => {
    it('nulls out the voice intro fields', async () => {
      prisma.user.update.mockResolvedValue({});

      const result = await service.clearVoiceIntro(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { voiceIntroUrl: null, voiceIntroDurationSeconds: null },
      });
      expect(result).toEqual({ url: null, durationSeconds: null });
    });
  });
});
