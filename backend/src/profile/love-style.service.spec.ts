import { PrismaService } from '../prisma/prisma.service';
import { SetLoveStyleDto } from './dto/set-love-style.dto';
import { LoveStyleService } from './love-style.service';

const USER_ID = 'user-1';

describe('LoveStyleService', () => {
  let service: LoveStyleService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new LoveStyleService(prisma as unknown as PrismaService);
  });

  describe('getLoveStyle', () => {
    it('returns defaults when the user has nothing set', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getLoveStyle(USER_ID);

      expect(result).toEqual({
        loveLanguages: [],
        showLoveLanguagesOnProfile: true,
        attachmentStyle: null,
        showAttachmentStyleOnProfile: true,
      });
    });

    it('returns the stored selections', async () => {
      prisma.user.findUnique.mockResolvedValue({
        loveLanguages: ['Thoughtful Gestures', 'Time Together'],
        showLoveLanguagesOnProfile: false,
        attachmentStyle: 'Secure',
        showAttachmentStyleOnProfile: true,
      });

      const result = await service.getLoveStyle(USER_ID);

      expect(result).toEqual({
        loveLanguages: ['Thoughtful Gestures', 'Time Together'],
        showLoveLanguagesOnProfile: false,
        attachmentStyle: 'Secure',
        showAttachmentStyleOnProfile: true,
      });
    });
  });

  describe('setLoveStyle', () => {
    it('persists the selections and visibility flags', async () => {
      const dto: SetLoveStyleDto = {
        loveLanguages: ['Physical Touch', 'Words of Affirmation'],
        showLoveLanguagesOnProfile: true,
        attachmentStyle: 'Anxious',
        showAttachmentStyleOnProfile: false,
      };
      prisma.user.update.mockResolvedValue({
        loveLanguages: dto.loveLanguages,
        showLoveLanguagesOnProfile: dto.showLoveLanguagesOnProfile,
        attachmentStyle: dto.attachmentStyle,
        showAttachmentStyleOnProfile: dto.showAttachmentStyleOnProfile,
      });

      const result = await service.setLoveStyle(USER_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          loveLanguages: ['Physical Touch', 'Words of Affirmation'],
          showLoveLanguagesOnProfile: true,
          attachmentStyle: 'Anxious',
          showAttachmentStyleOnProfile: false,
        },
      });
      expect(result.attachmentStyle).toBe('Anxious');
      expect(result.loveLanguages).toEqual(['Physical Touch', 'Words of Affirmation']);
    });

    it('clears the attachment style when omitted', async () => {
      const dto: SetLoveStyleDto = {
        loveLanguages: [],
        showLoveLanguagesOnProfile: true,
        showAttachmentStyleOnProfile: true,
      };
      prisma.user.update.mockResolvedValue({
        loveLanguages: [],
        showLoveLanguagesOnProfile: true,
        attachmentStyle: null,
        showAttachmentStyleOnProfile: true,
      });

      await service.setLoveStyle(USER_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ attachmentStyle: null }) }),
      );
    });
  });
});
