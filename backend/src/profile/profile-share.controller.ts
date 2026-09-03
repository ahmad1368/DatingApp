import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileShareService } from './profile-share.service';

@Controller('profile/share-link')
@UseGuards(JwtAuthGuard)
export class ProfileShareController {
  constructor(private readonly profileShareService: ProfileShareService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  getOrCreateShareLink(@CurrentUser() user: AuthenticatedUser) {
    return this.profileShareService.getOrCreateShareLink(user.id);
  }
}
