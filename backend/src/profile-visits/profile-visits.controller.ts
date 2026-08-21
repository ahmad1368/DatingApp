import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordProfileVisitDto } from './dto/record-profile-visit.dto';
import { ProfileVisitsService } from './profile-visits.service';

@Controller('profile-visits')
@UseGuards(JwtAuthGuard)
export class ProfileVisitsController {
  constructor(private readonly profileVisitsService: ProfileVisitsService) {}

  @Get()
  listVisitors(@CurrentUser() user: AuthenticatedUser) {
    return this.profileVisitsService.listVisitors(user.id);
  }

  @Post(':visitedUserId')
  @HttpCode(HttpStatus.CREATED)
  recordVisit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitedUserId') visitedUserId: string,
    @Body() dto: RecordProfileVisitDto,
  ) {
    return this.profileVisitsService.recordVisit(user.id, visitedUserId, dto.anonymous ?? false);
  }
}
