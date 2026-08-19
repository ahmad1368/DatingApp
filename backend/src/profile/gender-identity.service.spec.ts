import { PrismaService } from '../prisma/prisma.service';
import { SetGenderIdentityDto } from './dto/set-gender-identity.dto';
import { GenderIdentityService } from './gender-identity.service';

const USER_ID = 'user-1';

describe('GenderIdentityService', () => {
  let service: GenderIdentityService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new GenderIdentityService(prisma as unknown as PrismaService);
  });

  describe('getGenderIdentity', () => {
    it('returns defaults when the user has nothing set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        genderIdentities: [],
        customGenderDescription: null,
        showGenderOnProfile: true,
        orientations: [],
        customOrientationDescription: null,
        showOrientationOnProfile: true,
      });

      const result = await service.getGenderIdentity(USER_ID);

      expect(result).toEqual({
        genderIdentities: [],
        customGenderDescription: null,
        showGenderOnProfile: true,
        orientations: [],
        customOrientationDescription: null,
        showOrientationOnProfile: true,
      });
    });
  });

  describe('setGenderIdentity', () => {
    it('persists the selections, custom descriptions, and visibility flags', async () => {
      const dto: SetGenderIdentityDto = {
        genderIdentities: ['Non-binary'],
        customGenderDescription: 'Genderfluid, prefer they/them',
        showGenderOnProfile: false,
        orientations: ['Queer', 'Pansexual'],
        showOrientationOnProfile: true,
      };
      prisma.user.update.mockResolvedValue({
        genderIdentities: dto.genderIdentities,
        customGenderDescription: dto.customGenderDescription,
        showGenderOnProfile: dto.showGenderOnProfile,
        orientations: dto.orientations,
        customOrientationDescription: null,
        showOrientationOnProfile: dto.showOrientationOnProfile,
      });

      const result = await service.setGenderIdentity(USER_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          genderIdentities: ['Non-binary'],
          customGenderDescription: 'Genderfluid, prefer they/them',
          showGenderOnProfile: false,
          orientations: ['Queer', 'Pansexual'],
          customOrientationDescription: null,
          showOrientationOnProfile: true,
        },
      });
      expect(result.genderIdentities).toEqual(['Non-binary']);
      expect(result.showGenderOnProfile).toBe(false);
    });
  });
});
