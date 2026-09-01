import { Controller, Get, Param } from '@nestjs/common';
import { SafetyService } from './safety.service';

/**
 * Public read-only view for a "Safety Date Plan" share link
 * (SafetyService.generateDatePlanShareLink/getSharedDatePlan) - split out
 * from SafetyController, which is guarded, since whoever the planner
 * shares this link with (friends/family) has no account to authenticate
 * with.
 */
@Controller('safety/shared')
export class SharedDatePlanController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get(':token')
  getSharedDatePlan(@Param('token') token: string) {
    return this.safetyService.getSharedDatePlan(token);
  }
}
