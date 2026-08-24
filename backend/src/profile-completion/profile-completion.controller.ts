import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompletionService } from './profile-completion.service';

@Controller('profile-completion')
@UseGuards(JwtAuthGuard)
export class ProfileCompletionController {
  constructor(private readonly profileCompletionService: ProfileCompletionService) {}

  @Get()
  getCompletion(@CurrentUser() user: AuthenticatedUser) {
    return this.profileCompletionService.getCompletion(user.id);
  }
}
