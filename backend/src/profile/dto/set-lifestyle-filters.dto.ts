import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { RELATIONSHIP_GOALS } from '../../onboarding/onboarding.constants';
import { COMMUNITY_GROUP_IDS } from '../../community-groups/community-groups.constants';
import { BOUNDARY_TAGS, KINK_TAGS, RELATIONSHIP_DESIRES } from '../relationship-profile.constants';
import {
  CHILDREN_PREFERENCES,
  CIVIC_ACTIVITY_LEVELS,
  DIETARY_PREFERENCES,
  DRINKING_HABITS,
  EDUCATION_LEVELS,
  MAX_FILTER_SELECTIONS,
  MAX_HEIGHT_CM,
  MIN_HEIGHT_CM,
  PET_ALLERGY_STATUS_OPTIONS,
  PET_OWNERSHIP_OPTIONS,
  POLITICAL_ORIENTATIONS,
  RELIGIONS,
  SMOKING_HABITS,
  WORKOUT_HABITS,
} from '../lifestyle-filters.constants';

export class SetLifestyleFiltersDto {
  @IsOptional()
  @IsIn(SMOKING_HABITS)
  smokingHabit?: string;

  @IsOptional()
  @IsIn(DRINKING_HABITS)
  drinkingHabit?: string;

  @IsOptional()
  @IsIn(EDUCATION_LEVELS)
  education?: string;

  @IsOptional()
  @IsIn(RELIGIONS)
  religion?: string;

  @IsOptional()
  @IsIn(DIETARY_PREFERENCES)
  dietaryPreference?: string;

  @IsOptional()
  @IsIn(CHILDREN_PREFERENCES)
  wantsChildren?: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_HEIGHT_CM)
  @Max(MAX_HEIGHT_CM)
  heightCm?: number;

  @IsOptional()
  @IsIn(WORKOUT_HABITS)
  workoutHabit?: string;

  @IsOptional()
  @IsIn(PET_OWNERSHIP_OPTIONS)
  petOwnership?: string;

  @IsOptional()
  @IsIn(PET_ALLERGY_STATUS_OPTIONS)
  petAllergyStatus?: string;

  @IsOptional()
  @IsIn(POLITICAL_ORIENTATIONS)
  politicalOrientation?: string;

  @IsOptional()
  @IsIn(CIVIC_ACTIVITY_LEVELS)
  civicActivityLevel?: string;

  @IsBoolean()
  showLifestyleBadgesOnProfile!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(SMOKING_HABITS, { each: true })
  filterSmokingHabits!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(DRINKING_HABITS, { each: true })
  filterDrinkingHabits!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(EDUCATION_LEVELS, { each: true })
  filterEducationLevels!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(RELIGIONS, { each: true })
  filterReligions!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(DIETARY_PREFERENCES, { each: true })
  filterDietaryPreferences!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(CHILDREN_PREFERENCES, { each: true })
  filterWantsChildren!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(RELATIONSHIP_GOALS, { each: true })
  filterRelationshipGoals!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(KINK_TAGS, { each: true })
  filterKinkTags!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(RELATIONSHIP_DESIRES, { each: true })
  filterRelationshipDesires!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(BOUNDARY_TAGS, { each: true })
  filterBoundaryTags!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(PET_OWNERSHIP_OPTIONS, { each: true })
  filterPetOwnership!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(PET_ALLERGY_STATUS_OPTIONS, { each: true })
  filterPetAllergyStatus!: string[];

  /** When non-empty, the deck only shows candidates whose political orientation is one of these. */
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(POLITICAL_ORIENTATIONS, { each: true })
  filterPoliticalOrientations!: string[];

  /** When true, the deck only shows candidates who share at least one interest tag. */
  @IsBoolean()
  filterSharedInterestsOnly!: boolean;

  /** When true, the deck only shows photo-verified candidates. */
  @IsBoolean()
  filterVerifiedOnly!: boolean;

  /** When non-empty, the deck only shows candidates who share at least one of these community groups. */
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_SELECTIONS)
  @IsIn(COMMUNITY_GROUP_IDS, { each: true })
  filterCommunityGroups!: string[];
}
