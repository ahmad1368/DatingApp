import { ArrayMaxSize, IsArray, IsIn, IsOptional } from 'class-validator';
import { RELATIONSHIP_GOALS } from '../../onboarding/onboarding.constants';
import {
  CHILDREN_PREFERENCES,
  DIETARY_PREFERENCES,
  DRINKING_HABITS,
  EDUCATION_LEVELS,
  MAX_FILTER_SELECTIONS,
  RELIGIONS,
  SMOKING_HABITS,
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
}
