import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetLifestyleFiltersDto } from './dto/set-lifestyle-filters.dto';
import { LifestyleFiltersService } from './lifestyle-filters.service';

const USER_ID = 'user-1';

describe('LifestyleFiltersService', () => {
  let service: LifestyleFiltersService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new LifestyleFiltersService(prisma as unknown as PrismaService);
  });

  describe('getLifestyleFilters', () => {
    it('returns defaults when the user has nothing set', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getLifestyleFilters(USER_ID);

      expect(result).toEqual({
        smokingHabit: null,
        drinkingHabit: null,
        education: null,
        religion: null,
        dietaryPreference: null,
        wantsChildren: null,
        heightCm: null,
        workoutHabit: null,
        petOwnership: null,
        petAllergyStatus: null,
        politicalOrientation: null,
        civicActivityLevel: null,
        showLifestyleBadgesOnProfile: true,
        filterSmokingHabits: [],
        filterDrinkingHabits: [],
        filterWorkoutHabits: [],
        filterMinHeightCm: null,
        filterMaxHeightCm: null,
        filterEducationLevels: [],
        filterReligions: [],
        filterDietaryPreferences: [],
        filterWantsChildren: [],
        filterRelationshipGoals: [],
        filterKinkTags: [],
        filterRelationshipDesires: [],
        filterBoundaryTags: [],
        filterPetOwnership: [],
        filterPetAllergyStatus: [],
        filterPoliticalOrientations: [],
        filterSharedInterestsOnly: false,
        filterVerifiedOnly: false,
        filterCommunityGroups: [],
      });
    });
  });

  describe('setLifestyleFilters', () => {
    it('persists lifestyle attributes and filter selections', async () => {
      const dto: SetLifestyleFiltersDto = {
        smokingHabit: 'Never',
        drinkingHabit: 'Socially',
        education: 'Masters',
        religion: 'Buddhist',
        dietaryPreference: 'Vegetarian',
        wantsChildren: 'Wants Children',
        heightCm: 178,
        workoutHabit: 'Often',
        petOwnership: 'Dog',
        petAllergyStatus: 'Allergy Free',
        politicalOrientation: 'Moderate',
        civicActivityLevel: 'Regularly Active',
        showLifestyleBadgesOnProfile: true,
        filterSmokingHabits: ['Never', 'Trying to Quit'],
        filterDrinkingHabits: ['Never', 'Socially'],
        filterWorkoutHabits: ['Often', 'Daily'],
        filterMinHeightCm: 160,
        filterMaxHeightCm: 190,
        filterEducationLevels: ['Bachelors', 'Masters', 'Doctorate'],
        filterReligions: [],
        filterDietaryPreferences: ['Vegetarian', 'Vegan'],
        filterWantsChildren: ['Wants Children', 'Open to Children'],
        filterRelationshipGoals: ['LONG_TERM'],
        filterKinkTags: ['BDSM'],
        filterRelationshipDesires: ['Long-Term Relationship'],
        filterBoundaryTags: ['Sober / Substance-Free'],
        filterPetOwnership: ['Dog', 'Cat'],
        filterPetAllergyStatus: ['Allergy Free'],
        filterPoliticalOrientations: ['Moderate', 'Liberal'],
        filterSharedInterestsOnly: true,
        filterVerifiedOnly: true,
        filterCommunityGroups: ['book-lovers'],
      };
      prisma.user.update.mockResolvedValue({ ...dto });

      const result = await service.setLifestyleFilters(USER_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          smokingHabit: 'Never',
          drinkingHabit: 'Socially',
          education: 'Masters',
          religion: 'Buddhist',
          dietaryPreference: 'Vegetarian',
          wantsChildren: 'Wants Children',
          heightCm: 178,
          workoutHabit: 'Often',
          petOwnership: 'Dog',
          petAllergyStatus: 'Allergy Free',
          politicalOrientation: 'Moderate',
          civicActivityLevel: 'Regularly Active',
          showLifestyleBadgesOnProfile: true,
          filterSmokingHabits: ['Never', 'Trying to Quit'],
          filterDrinkingHabits: ['Never', 'Socially'],
          filterWorkoutHabits: ['Often', 'Daily'],
          filterMinHeightCm: 160,
          filterMaxHeightCm: 190,
          filterEducationLevels: ['Bachelors', 'Masters', 'Doctorate'],
          filterReligions: [],
          filterDietaryPreferences: ['Vegetarian', 'Vegan'],
          filterWantsChildren: ['Wants Children', 'Open to Children'],
          filterRelationshipGoals: ['LONG_TERM'],
          filterKinkTags: ['BDSM'],
          filterRelationshipDesires: ['Long-Term Relationship'],
          filterBoundaryTags: ['Sober / Substance-Free'],
          filterPetOwnership: ['Dog', 'Cat'],
          filterPetAllergyStatus: ['Allergy Free'],
          filterPoliticalOrientations: ['Moderate', 'Liberal'],
          filterSharedInterestsOnly: true,
          filterVerifiedOnly: true,
          filterCommunityGroups: ['book-lovers'],
        },
        select: expect.any(Object),
      });
      expect(result.education).toBe('Masters');
      expect(result.filterEducationLevels).toEqual(['Bachelors', 'Masters', 'Doctorate']);
      expect(result.heightCm).toBe(178);
    });

    it('clears optional attributes that are omitted', async () => {
      const dto: SetLifestyleFiltersDto = {
        showLifestyleBadgesOnProfile: false,
        filterSmokingHabits: [],
        filterDrinkingHabits: [],
        filterWorkoutHabits: [],
        filterEducationLevels: [],
        filterReligions: [],
        filterDietaryPreferences: [],
        filterWantsChildren: [],
        filterRelationshipGoals: [],
        filterKinkTags: [],
        filterRelationshipDesires: [],
        filterBoundaryTags: [],
        filterPetOwnership: [],
        filterPetAllergyStatus: [],
        filterPoliticalOrientations: [],
        filterSharedInterestsOnly: false,
        filterVerifiedOnly: false,
        filterCommunityGroups: [],
      };
      prisma.user.update.mockResolvedValue({
        smokingHabit: null,
        drinkingHabit: null,
        education: null,
        religion: null,
        dietaryPreference: null,
        wantsChildren: null,
        heightCm: null,
        workoutHabit: null,
        petOwnership: null,
        petAllergyStatus: null,
        showLifestyleBadgesOnProfile: false,
        filterSmokingHabits: [],
        filterDrinkingHabits: [],
        filterEducationLevels: [],
        filterReligions: [],
        filterDietaryPreferences: [],
        filterWantsChildren: [],
        filterRelationshipGoals: [],
      });

      await service.setLifestyleFilters(USER_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            smokingHabit: null,
            education: null,
            heightCm: null,
            workoutHabit: null,
            petOwnership: null,
            showLifestyleBadgesOnProfile: false,
          }),
        }),
      );
    });

    it('rejects a min height greater than the max height', async () => {
      const dto: SetLifestyleFiltersDto = {
        showLifestyleBadgesOnProfile: true,
        filterSmokingHabits: [],
        filterDrinkingHabits: [],
        filterWorkoutHabits: [],
        filterMinHeightCm: 190,
        filterMaxHeightCm: 160,
        filterEducationLevels: [],
        filterReligions: [],
        filterDietaryPreferences: [],
        filterWantsChildren: [],
        filterRelationshipGoals: [],
        filterKinkTags: [],
        filterRelationshipDesires: [],
        filterBoundaryTags: [],
        filterPetOwnership: [],
        filterPetAllergyStatus: [],
        filterPoliticalOrientations: [],
        filterSharedInterestsOnly: false,
        filterVerifiedOnly: false,
        filterCommunityGroups: [],
      };

      await expect(service.setLifestyleFilters(USER_ID, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
