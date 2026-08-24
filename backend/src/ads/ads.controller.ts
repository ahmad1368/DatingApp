import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdsService } from './ads.service';

@Controller('ads')
@UseGuards(JwtAuthGuard)
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Get('eligibility')
  getEligibility(@CurrentUser() user: AuthenticatedUser) {
    return this.adsService.getEligibility(user.id);
  }

  @Get('next')
  getNextAd(@CurrentUser() user: AuthenticatedUser, @Query('slotIndex') slotIndex?: string) {
    return this.adsService.getNextAd(user.id, slotIndex ? Number(slotIndex) : undefined);
  }
}
