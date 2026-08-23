import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CuratedProfilesService } from './curated-profiles.service';

@Controller('curated-profiles')
@UseGuards(JwtAuthGuard)
export class CuratedProfilesController {
  constructor(private readonly curatedProfilesService: CuratedProfilesService) {}

  @Get('daily')
  getDailyPicks(@CurrentUser() user: AuthenticatedUser) {
    return this.curatedProfilesService.getDailyPicks(user.id);
  }

  @Get('refresh-countdown')
  getRefreshCountdown() {
    return this.curatedProfilesService.getRefreshCountdown();
  }
}
