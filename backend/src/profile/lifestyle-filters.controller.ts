import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RELATIONSHIP_GOALS } from '../onboarding/onboarding.constants';
import { COMMUNITY_GROUPS } from '../community-groups/community-groups.constants';
import { BOUNDARY_TAGS, KINK_TAGS, RELATIONSHIP_DESIRES } from './relationship-profile.constants';
import { SetLifestyleFiltersDto } from './dto/set-lifestyle-filters.dto';
import {
  CHILDREN_PREFERENCES,
  CIVIC_ACTIVITY_LEVELS,
  DIETARY_PREFERENCES,
  DRINKING_HABITS,
  EDUCATION_LEVELS,
  MAX_HEIGHT_CM,
  MIN_HEIGHT_CM,
  PET_ALLERGY_STATUS_OPTIONS,
  PET_OWNERSHIP_OPTIONS,
  POLITICAL_ORIENTATIONS,
  RELIGIONS,
  SMOKING_HABITS,
  WORKOUT_HABITS,
} from './lifestyle-filters.constants';
import { LifestyleFiltersService } from './lifestyle-filters.service';

@Controller('profile/lifestyle')
export class LifestyleFiltersController {
  constructor(private readonly lifestyleFiltersService: LifestyleFiltersService) {}

  @Get('catalog')
  getCatalog() {
    return {
      smokingHabits: SMOKING_HABITS,
      drinkingHabits: DRINKING_HABITS,
      educationLevels: EDUCATION_LEVELS,
      religions: RELIGIONS,
      dietaryPreferences: DIETARY_PREFERENCES,
      childrenPreferences: CHILDREN_PREFERENCES,
      relationshipGoals: RELATIONSHIP_GOALS,
      kinkTags: KINK_TAGS,
      relationshipDesires: RELATIONSHIP_DESIRES,
      boundaryTags: BOUNDARY_TAGS,
      communityGroups: COMMUNITY_GROUPS,
      workoutHabits: WORKOUT_HABITS,
      petOwnershipOptions: PET_OWNERSHIP_OPTIONS,
      petAllergyStatusOptions: PET_ALLERGY_STATUS_OPTIONS,
      minHeightCm: MIN_HEIGHT_CM,
      maxHeightCm: MAX_HEIGHT_CM,
      politicalOrientations: POLITICAL_ORIENTATIONS,
      civicActivityLevels: CIVIC_ACTIVITY_LEVELS,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getLifestyleFilters(@CurrentUser() user: AuthenticatedUser) {
    return this.lifestyleFiltersService.getLifestyleFilters(user.id);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setLifestyleFilters(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetLifestyleFiltersDto) {
    return this.lifestyleFiltersService.setLifestyleFilters(user.id, dto);
  }
}
