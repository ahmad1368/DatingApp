import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DateSuggestionsService } from './date-suggestions.service';

@Controller('date-suggestions')
@UseGuards(JwtAuthGuard)
export class DateSuggestionsController {
  constructor(private readonly dateSuggestionsService: DateSuggestionsService) {}

  @Get(':matchId')
  suggestMeetupSpots(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.dateSuggestionsService.suggestMeetupSpots(user.id, matchId);
  }
}
