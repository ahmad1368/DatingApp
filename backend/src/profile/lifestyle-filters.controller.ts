import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RELATIONSHIP_GOALS } from '../onboarding/onboarding.constants';
import { SetLifestyleFiltersDto } from './dto/set-lifestyle-filters.dto';
import {
  CHILDREN_PREFERENCES,
  DIETARY_PREFERENCES,
  DRINKING_HABITS,
  EDUCATION_LEVELS,
  RELIGIONS,
  SMOKING_HABITS,
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
