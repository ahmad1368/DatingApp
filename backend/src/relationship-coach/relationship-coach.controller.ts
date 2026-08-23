import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RelationshipCoachService } from './relationship-coach.service';

@Controller('relationship-coach')
@UseGuards(JwtAuthGuard)
export class RelationshipCoachController {
  constructor(private readonly relationshipCoachService: RelationshipCoachService) {}

  @Get('tips')
  getTips(@CurrentUser() user: AuthenticatedUser, @Query('matchId') matchId?: string) {
    return this.relationshipCoachService.getTips(user.id, matchId);
  }
}
