import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordSwipeDto } from './dto/record-swipe.dto';
import { SetIncognitoModeDto } from './dto/set-incognito-mode.dto';
import { SetActiveModeDto } from './dto/set-active-mode.dto';
import { SetSnoozeModeDto } from './dto/set-snooze-mode.dto';
import { LikedBySort } from './discovery.constants';
import { DiscoveryService } from './discovery.service';

@Controller('discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('deck')
  getDeck(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.getDeck(user.id);
  }

  @Post('swipe')
  @HttpCode(HttpStatus.OK)
  recordSwipe(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordSwipeDto) {
    return this.discoveryService.recordSwipe(
      user.id,
      dto.targetUserId,
      dto.action,
      dto.complimentText,
      dto.complimentTarget,
    );
  }

  @Post('undo')
  @HttpCode(HttpStatus.OK)
  undoLastSwipe(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.undoLastSwipe(user.id);
  }

  @Put('incognito')
  @HttpCode(HttpStatus.OK)
  setIncognitoMode(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetIncognitoModeDto) {
    return this.discoveryService.setIncognitoMode(user.id, dto.enabled);
  }

  @Post('boost')
  @HttpCode(HttpStatus.CREATED)
  activateBoost(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.activateBoost(user.id);
  }

  @Get('boost')
  getBoostStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.getBoostStatus(user.id);
  }

  @Put('mode')
  @HttpCode(HttpStatus.OK)
  setActiveMode(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetActiveModeDto) {
    return this.discoveryService.setActiveMode(user.id, dto.mode);
  }

  @Get('likes')
  getLikedByGrid(@CurrentUser() user: AuthenticatedUser, @Query('sortBy') sortBy?: LikedBySort) {
    return this.discoveryService.getLikedByGrid(user.id, sortBy);
  }

  @Put('snooze')
  @HttpCode(HttpStatus.OK)
  setSnoozeMode(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetSnoozeModeDto) {
    return this.discoveryService.setSnoozeMode(user.id, dto.enabled, dto.until, dto.statusMessage);
  }

  @Get('snooze')
  getSnoozeStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.getSnoozeStatus(user.id);
  }
}
