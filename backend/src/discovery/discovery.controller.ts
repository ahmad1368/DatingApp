import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordSwipeDto } from './dto/record-swipe.dto';
import { SetActiveStatusVisibilityDto } from './dto/set-active-status-visibility.dto';
import { SetIncognitoModeDto } from './dto/set-incognito-mode.dto';
import { SetActiveModeDto } from './dto/set-active-mode.dto';
import { SetSnoozeModeDto } from './dto/set-snooze-mode.dto';
import { SetVisibilityScheduleDto } from './dto/set-visibility-schedule.dto';
import { SubmitDeckFeedbackDto } from './dto/submit-deck-feedback.dto';
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

  @Get('video-feed')
  getVideoFeed(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.getVideoFeed(user.id);
  }

  @Get('pass-reasons')
  getPassReasons() {
    return this.discoveryService.getPassReasons();
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
      dto.icebreakerPromptId,
      dto.icebreakerOptionIndex,
      dto.passReason,
      dto.usePriorityLike,
    );
  }

  @Post('deck-feedback')
  @HttpCode(HttpStatus.OK)
  submitDeckFeedback(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitDeckFeedbackDto) {
    return this.discoveryService.submitDeckFeedback(user.id, dto.rating);
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

  @Put('active-status-visibility')
  @HttpCode(HttpStatus.OK)
  setActiveStatusVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetActiveStatusVisibilityDto,
  ) {
    return this.discoveryService.setActiveStatusVisibility(user.id, dto.enabled);
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

  @Post('boost/super')
  @HttpCode(HttpStatus.CREATED)
  activateSuperBoost(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.activateSuperBoost(user.id);
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

  @Put('visibility-schedule')
  @HttpCode(HttpStatus.OK)
  setVisibilitySchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetVisibilityScheduleDto) {
    return this.discoveryService.setVisibilitySchedule(
      user.id,
      dto.enabled,
      dto.hiddenStartHourUtc,
      dto.hiddenEndHourUtc,
    );
  }

  @Get('visibility-schedule')
  getVisibilitySchedule(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.getVisibilitySchedule(user.id);
  }

  @Get('happy-hour')
  getHappyHourStatus() {
    return this.discoveryService.getHappyHourStatus();
  }
}
