import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetLifestyleFiltersDto } from './dto/set-lifestyle-filters.dto';

export interface LifestyleFiltersResult {
  smokingHabit: string | null;
  drinkingHabit: string | null;
  education: string | null;
  religion: string | null;
  dietaryPreference: string | null;
  wantsChildren: string | null;
  heightCm: number | null;
  workoutHabit: string | null;
  petOwnership: string | null;
  petAllergyStatus: string | null;
  politicalOrientation: string | null;
  civicActivityLevel: string | null;
  showLifestyleBadgesOnProfile: boolean;
  filterSmokingHabits: string[];
  filterDrinkingHabits: string[];
  filterWorkoutHabits: string[];
  filterMinHeightCm: number | null;
  filterMaxHeightCm: number | null;
  filterEducationLevels: string[];
  filterReligions: string[];
  filterDietaryPreferences: string[];
  filterWantsChildren: string[];
  filterRelationshipGoals: string[];
  filterKinkTags: string[];
  filterRelationshipDesires: string[];
  filterBoundaryTags: string[];
  filterPetOwnership: string[];
  filterPetAllergyStatus: string[];
  filterPoliticalOrientations: string[];
  filterSharedInterestsOnly: boolean;
  filterVerifiedOnly: boolean;
  filterCommunityGroups: string[];
}

interface LifestyleFiltersRecord {
  smokingHabit: string | null;
  drinkingHabit: string | null;
  education: string | null;
  religion: string | null;
  dietaryPreference: string | null;
  wantsChildren: string | null;
  heightCm: number | null;
  workoutHabit: string | null;
  petOwnership: string | null;
  petAllergyStatus: string | null;
  politicalOrientation: string | null;
  civicActivityLevel: string | null;
  showLifestyleBadgesOnProfile: boolean;
  filterSmokingHabits: string[];
  filterDrinkingHabits: string[];
  filterWorkoutHabits: string[];
  filterMinHeightCm: number | null;
  filterMaxHeightCm: number | null;
  filterEducationLevels: string[];
  filterReligions: string[];
  filterDietaryPreferences: string[];
  filterWantsChildren: string[];
  filterRelationshipGoals: string[];
  filterKinkTags: string[];
  filterRelationshipDesires: string[];
  filterBoundaryTags: string[];
  filterPetOwnership: string[];
  filterPetAllergyStatus: string[];
  filterPoliticalOrientations: string[];
  filterSharedInterestsOnly: boolean;
  filterVerifiedOnly: boolean;
  filterCommunityGroups: string[];
}

const SELECT = {
  smokingHabit: true,
  drinkingHabit: true,
  education: true,
  religion: true,
  dietaryPreference: true,
  wantsChildren: true,
  heightCm: true,
  workoutHabit: true,
  petOwnership: true,
  petAllergyStatus: true,
  politicalOrientation: true,
  civicActivityLevel: true,
  showLifestyleBadgesOnProfile: true,
  filterSmokingHabits: true,
  filterDrinkingHabits: true,
  filterWorkoutHabits: true,
  filterMinHeightCm: true,
  filterMaxHeightCm: true,
  filterEducationLevels: true,
  filterReligions: true,
  filterDietaryPreferences: true,
  filterWantsChildren: true,
  filterRelationshipGoals: true,
  filterKinkTags: true,
  filterRelationshipDesires: true,
  filterBoundaryTags: true,
  filterPetOwnership: true,
  filterPetAllergyStatus: true,
  filterPoliticalOrientations: true,
  filterSharedInterestsOnly: true,
  filterVerifiedOnly: true,
  filterCommunityGroups: true,
} as const;

@Injectable()
export class LifestyleFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  async getLifestyleFilters(userId: string): Promise<LifestyleFiltersResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: SELECT });
    return this.toResult(user);
  }

  async setLifestyleFilters(
    userId: string,
    dto: SetLifestyleFiltersDto,
  ): Promise<LifestyleFiltersResult> {
    if (
      dto.filterMinHeightCm != null &&
      dto.filterMaxHeightCm != null &&
      dto.filterMinHeightCm > dto.filterMaxHeightCm
    ) {
      throw new BadRequestException('filterMinHeightCm cannot be greater than filterMaxHeightCm.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        smokingHabit: dto.smokingHabit ?? null,
        drinkingHabit: dto.drinkingHabit ?? null,
        education: dto.education ?? null,
        religion: dto.religion ?? null,
        dietaryPreference: dto.dietaryPreference ?? null,
        wantsChildren: dto.wantsChildren ?? null,
        heightCm: dto.heightCm ?? null,
        workoutHabit: dto.workoutHabit ?? null,
        petOwnership: dto.petOwnership ?? null,
        petAllergyStatus: dto.petAllergyStatus ?? null,
        politicalOrientation: dto.politicalOrientation ?? null,
        civicActivityLevel: dto.civicActivityLevel ?? null,
        showLifestyleBadgesOnProfile: dto.showLifestyleBadgesOnProfile,
        filterSmokingHabits: dto.filterSmokingHabits,
        filterDrinkingHabits: dto.filterDrinkingHabits,
        filterWorkoutHabits: dto.filterWorkoutHabits,
        filterMinHeightCm: dto.filterMinHeightCm ?? null,
        filterMaxHeightCm: dto.filterMaxHeightCm ?? null,
        filterEducationLevels: dto.filterEducationLevels,
        filterReligions: dto.filterReligions,
        filterDietaryPreferences: dto.filterDietaryPreferences,
        filterWantsChildren: dto.filterWantsChildren,
        filterRelationshipGoals: dto.filterRelationshipGoals,
        filterKinkTags: dto.filterKinkTags,
        filterRelationshipDesires: dto.filterRelationshipDesires,
        filterBoundaryTags: dto.filterBoundaryTags,
        filterPetOwnership: dto.filterPetOwnership,
        filterPetAllergyStatus: dto.filterPetAllergyStatus,
        filterPoliticalOrientations: dto.filterPoliticalOrientations,
        filterSharedInterestsOnly: dto.filterSharedInterestsOnly,
        filterVerifiedOnly: dto.filterVerifiedOnly,
        filterCommunityGroups: dto.filterCommunityGroups,
      },
      select: SELECT,
    });

    return this.toResult(user);
  }

  private toResult(user: LifestyleFiltersRecord | null): LifestyleFiltersResult {
    return {
      smokingHabit: user?.smokingHabit ?? null,
      drinkingHabit: user?.drinkingHabit ?? null,
      education: user?.education ?? null,
      religion: user?.religion ?? null,
      dietaryPreference: user?.dietaryPreference ?? null,
      wantsChildren: user?.wantsChildren ?? null,
      heightCm: user?.heightCm ?? null,
      workoutHabit: user?.workoutHabit ?? null,
      petOwnership: user?.petOwnership ?? null,
      petAllergyStatus: user?.petAllergyStatus ?? null,
      politicalOrientation: user?.politicalOrientation ?? null,
      civicActivityLevel: user?.civicActivityLevel ?? null,
      showLifestyleBadgesOnProfile: user?.showLifestyleBadgesOnProfile ?? true,
      filterSmokingHabits: user?.filterSmokingHabits ?? [],
      filterDrinkingHabits: user?.filterDrinkingHabits ?? [],
      filterWorkoutHabits: user?.filterWorkoutHabits ?? [],
      filterMinHeightCm: user?.filterMinHeightCm ?? null,
      filterMaxHeightCm: user?.filterMaxHeightCm ?? null,
      filterEducationLevels: user?.filterEducationLevels ?? [],
      filterReligions: user?.filterReligions ?? [],
      filterDietaryPreferences: user?.filterDietaryPreferences ?? [],
      filterWantsChildren: user?.filterWantsChildren ?? [],
      filterRelationshipGoals: user?.filterRelationshipGoals ?? [],
      filterKinkTags: user?.filterKinkTags ?? [],
      filterRelationshipDesires: user?.filterRelationshipDesires ?? [],
      filterBoundaryTags: user?.filterBoundaryTags ?? [],
      filterPetOwnership: user?.filterPetOwnership ?? [],
      filterPetAllergyStatus: user?.filterPetAllergyStatus ?? [],
      filterPoliticalOrientations: user?.filterPoliticalOrientations ?? [],
      filterSharedInterestsOnly: user?.filterSharedInterestsOnly ?? false,
      filterVerifiedOnly: user?.filterVerifiedOnly ?? false,
      filterCommunityGroups: user?.filterCommunityGroups ?? [],
    };
  }
}
