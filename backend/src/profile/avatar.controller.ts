import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AvatarService } from './avatar.service';
import { LinkThirdPartyAvatarDto } from './dto/link-third-party-avatar.dto';
import { SelectAvatarStyleDto } from './dto/select-avatar-style.dto';
import { SetAvatarVisibilityDto } from './dto/set-avatar-visibility.dto';

@Controller('profile/avatar')
@UseGuards(JwtAuthGuard)
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Get('styles')
  getCatalog() {
    return this.avatarService.getCatalog();
  }

  @Get()
  getMyAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.avatarService.getMyAvatar(user.id);
  }

  @Put('style')
  @HttpCode(HttpStatus.OK)
  selectAvatarStyle(@CurrentUser() user: AuthenticatedUser, @Body() dto: SelectAvatarStyleDto) {
    return this.avatarService.selectAvatarStyle(user.id, dto.avatarStyleId);
  }

  @Put('link')
  @HttpCode(HttpStatus.OK)
  linkThirdPartyAvatar(@CurrentUser() user: AuthenticatedUser, @Body() dto: LinkThirdPartyAvatarDto) {
    return this.avatarService.linkThirdPartyAvatar(user.id, dto.url);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clearAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.avatarService.clearAvatar(user.id);
  }

  @Put('visibility')
  @HttpCode(HttpStatus.OK)
  setVisibility(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAvatarVisibilityDto) {
    return this.avatarService.setShowAvatarOnProfile(user.id, dto.showAvatarOnProfile);
  }
}
