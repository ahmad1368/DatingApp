import { Body, Controller, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  completeOnboarding(@CurrentUser() user: AuthenticatedUser, @Body() dto: CompleteOnboardingDto) {
    return this.onboardingService.completeOnboarding(user.id, dto);
  }
}
