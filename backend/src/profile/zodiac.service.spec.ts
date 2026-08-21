import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZodiacService } from './zodiac.service';

const USER_ID = 'user-1';

describe('ZodiacService', () => {
  let service: ZodiacService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new ZodiacService(prisma as unknown as PrismaService);
  });

  describe('getZodiac', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getZodiac(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('derives the sign from dateOfBirth', async () => {
      prisma.user.findUnique.mockResolvedValue({
        dateOfBirth: new Date(Date.UTC(1995, 6, 25)),
        showZodiacOnProfile: true,
      });

      const result = await service.getZodiac(USER_ID);

      expect(result).toEqual({ sign: 'Leo', showZodiacOnProfile: true });
    });

    it('reports a null sign when there is no date of birth', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: null, showZodiacOnProfile: true });

      const result = await service.getZodiac(USER_ID);

      expect(result.sign).toBeNull();
    });
  });

  describe('setShowZodiacOnProfile', () => {
    it('updates the visibility toggle', async () => {
      prisma.user.update.mockResolvedValue({
        dateOfBirth: new Date(Date.UTC(1995, 6, 25)),
        showZodiacOnProfile: false,
      });

      const result = await service.setShowZodiacOnProfile(USER_ID, false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { showZodiacOnProfile: false },
        select: { dateOfBirth: true, showZodiacOnProfile: true },
      });
      expect(result).toEqual({ sign: 'Leo', showZodiacOnProfile: false });
    });
  });
});
