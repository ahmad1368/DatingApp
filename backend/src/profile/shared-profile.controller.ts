import { Controller, Get, Param } from '@nestjs/common';
import { ProfileShareService } from './profile-share.service';

/**
 * Public read-only view for a "Direct Profile Link & QR Code Sharing" link
 * (ProfileShareService.getOrCreateShareLink/getSharedProfile) - split out
 * from ProfileShareController, which is guarded, since whoever opens this
 * link may not have an account to authenticate with.
 */
@Controller('profile/shared')
export class SharedProfileController {
  constructor(private readonly profileShareService: ProfileShareService) {}

  @Get(':token')
  getSharedProfile(@Param('token') token: string) {
    return this.profileShareService.getSharedProfile(token);
  }
}
