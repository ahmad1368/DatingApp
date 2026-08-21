import { Injectable } from '@nestjs/common';
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
  showLifestyleBadgesOnProfile: boolean;
  filterSmokingHabits: string[];
  filterDrinkingHabits: string[];
  filterEducationLevels: string[];
  filterReligions: string[];
  filterDietaryPreferences: string[];
  filterWantsChildren: string[];
  filterRelationshipGoals: string[];
  filterKinkTags: string[];
  filterRelationshipDesires: string[];
  filterSharedInterestsOnly: boolean;
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
  showLifestyleBadgesOnProfile: boolean;
  filterSmokingHabits: string[];
  filterDrinkingHabits: string[];
  filterEducationLevels: string[];
  filterReligions: string[];
  filterDietaryPreferences: string[];
  filterWantsChildren: string[];
  filterRelationshipGoals: string[];
  filterKinkTags: string[];
  filterRelationshipDesires: string[];
  filterSharedInterestsOnly: boolean;
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
  showLifestyleBadgesOnProfile: true,
  filterSmokingHabits: true,
  filterDrinkingHabits: true,
  filterEducationLevels: true,
  filterReligions: true,
  filterDietaryPreferences: true,
  filterWantsChildren: true,
  filterRelationshipGoals: true,
  filterKinkTags: true,
  filterRelationshipDesires: true,
  filterSharedInterestsOnly: true,
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
        showLifestyleBadgesOnProfile: dto.showLifestyleBadgesOnProfile,
        filterSmokingHabits: dto.filterSmokingHabits,
        filterDrinkingHabits: dto.filterDrinkingHabits,
        filterEducationLevels: dto.filterEducationLevels,
        filterReligions: dto.filterReligions,
        filterDietaryPreferences: dto.filterDietaryPreferences,
        filterWantsChildren: dto.filterWantsChildren,
        filterRelationshipGoals: dto.filterRelationshipGoals,
        filterKinkTags: dto.filterKinkTags,
        filterRelationshipDesires: dto.filterRelationshipDesires,
        filterSharedInterestsOnly: dto.filterSharedInterestsOnly,
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
      showLifestyleBadgesOnProfile: user?.showLifestyleBadgesOnProfile ?? true,
      filterSmokingHabits: user?.filterSmokingHabits ?? [],
      filterDrinkingHabits: user?.filterDrinkingHabits ?? [],
      filterEducationLevels: user?.filterEducationLevels ?? [],
      filterReligions: user?.filterReligions ?? [],
      filterDietaryPreferences: user?.filterDietaryPreferences ?? [],
      filterWantsChildren: user?.filterWantsChildren ?? [],
      filterRelationshipGoals: user?.filterRelationshipGoals ?? [],
      filterKinkTags: user?.filterKinkTags ?? [],
      filterRelationshipDesires: user?.filterRelationshipDesires ?? [],
      filterSharedInterestsOnly: user?.filterSharedInterestsOnly ?? false,
    };
  }
}
