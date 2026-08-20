import { PrismaService } from '../prisma/prisma.service';
import { SetRelationshipProfileDto } from './dto/set-relationship-profile.dto';
import { RelationshipProfileService } from './relationship-profile.service';

const USER_ID = 'user-1';

describe('RelationshipProfileService', () => {
  let service: RelationshipProfileService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new RelationshipProfileService(prisma as unknown as PrismaService);
  });

  describe('getRelationshipProfile', () => {
    it('returns defaults when the user has nothing set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        relationshipStructure: null,
        showRelationshipStructureOnProfile: true,
        kinkTags: [],
        showKinkTagsOnProfile: true,
        relationshipDesires: [],
        showRelationshipDesiresOnProfile: true,
        customRelationshipIntent: null,
        showCustomRelationshipIntentOnProfile: true,
      });

      const result = await service.getRelationshipProfile(USER_ID);

      expect(result).toEqual({
        relationshipStructure: null,
        showRelationshipStructureOnProfile: true,
        kinkTags: [],
        showKinkTagsOnProfile: true,
        relationshipDesires: [],
        showRelationshipDesiresOnProfile: true,
        customRelationshipIntent: null,
        showCustomRelationshipIntentOnProfile: true,
      });
    });
  });

  describe('setRelationshipProfile', () => {
    it('persists the selections and visibility flags', async () => {
      const dto: SetRelationshipProfileDto = {
        relationshipStructure: 'Polyamorous',
        showRelationshipStructureOnProfile: false,
        kinkTags: ['BDSM', 'Roleplay'],
        showKinkTagsOnProfile: true,
        relationshipDesires: ['Thruple', 'Casual Dating'],
        showRelationshipDesiresOnProfile: true,
        customRelationshipIntent: 'Long distance okay',
        showCustomRelationshipIntentOnProfile: true,
      };
      prisma.user.update.mockResolvedValue({
        relationshipStructure: dto.relationshipStructure,
        showRelationshipStructureOnProfile: dto.showRelationshipStructureOnProfile,
        kinkTags: dto.kinkTags,
        showKinkTagsOnProfile: dto.showKinkTagsOnProfile,
        relationshipDesires: dto.relationshipDesires,
        showRelationshipDesiresOnProfile: dto.showRelationshipDesiresOnProfile,
        customRelationshipIntent: dto.customRelationshipIntent,
        showCustomRelationshipIntentOnProfile: dto.showCustomRelationshipIntentOnProfile,
      });

      const result = await service.setRelationshipProfile(USER_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          relationshipStructure: 'Polyamorous',
          showRelationshipStructureOnProfile: false,
          kinkTags: ['BDSM', 'Roleplay'],
          showKinkTagsOnProfile: true,
          relationshipDesires: ['Thruple', 'Casual Dating'],
          showRelationshipDesiresOnProfile: true,
          customRelationshipIntent: 'Long distance okay',
          showCustomRelationshipIntentOnProfile: true,
        },
      });
      expect(result.relationshipStructure).toBe('Polyamorous');
      expect(result.showRelationshipStructureOnProfile).toBe(false);
      expect(result.customRelationshipIntent).toBe('Long distance okay');
    });

    it('clears the relationship structure and custom intent when omitted', async () => {
      const dto: SetRelationshipProfileDto = {
        showRelationshipStructureOnProfile: true,
        kinkTags: [],
        showKinkTagsOnProfile: true,
        relationshipDesires: [],
        showRelationshipDesiresOnProfile: true,
        showCustomRelationshipIntentOnProfile: true,
      };
      prisma.user.update.mockResolvedValue({
        relationshipStructure: null,
        showRelationshipStructureOnProfile: true,
        kinkTags: [],
        showKinkTagsOnProfile: true,
        relationshipDesires: [],
        showRelationshipDesiresOnProfile: true,
        customRelationshipIntent: null,
        showCustomRelationshipIntentOnProfile: true,
      });

      await service.setRelationshipProfile(USER_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: expect.objectContaining({
          relationshipStructure: null,
          customRelationshipIntent: null,
        }),
      });
    });
  });
});
