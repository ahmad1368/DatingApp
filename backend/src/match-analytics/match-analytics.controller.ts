import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MatchAnalyticsService } from './match-analytics.service';

@Controller('match-analytics')
@UseGuards(JwtAuthGuard)
export class MatchAnalyticsController {
  constructor(private readonly matchAnalyticsService: MatchAnalyticsService) {}

  @Get('insights')
  getMatchInsights(@CurrentUser() user: AuthenticatedUser) {
    return this.matchAnalyticsService.getMatchInsights(user.id);
  }
}
