import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnswerCallDto } from './dto/answer-call.dto';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { SetAppearanceFilterDto } from './dto/set-appearance-filter.dto';
import { SetIcebreakerOverlayDto } from './dto/set-icebreaker-overlay.dto';
import { SetMediaControlsDto } from './dto/set-media-controls.dto';
import { SetVirtualBackgroundDto } from './dto/set-virtual-background.dto';
import { SubmitIceCandidateDto } from './dto/submit-ice-candidate.dto';
import { CheckTranscriptDto } from './dto/check-transcript.dto';
import { ReportCallDto } from './dto/report-call.dto';
import { APPEARANCE_FILTERS, VIRTUAL_BACKGROUNDS } from './calling.constants';
import { CallingService } from './calling.service';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallingController {
  constructor(private readonly callingService: CallingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  initiateCall(@CurrentUser() user: AuthenticatedUser, @Body() dto: InitiateCallDto) {
    return this.callingService.initiateCall(user.id, dto.calleeId, dto.type, dto.offerSdp);
  }

  @Get('incoming')
  listIncomingCalls(@CurrentUser() user: AuthenticatedUser) {
    return this.callingService.listIncomingCalls(user.id);
  }

  @Get(':callId')
  getCall(@CurrentUser() user: AuthenticatedUser, @Param('callId') callId: string) {
    return this.callingService.getCall(user.id, callId);
  }

  @Post(':callId/answer')
  @HttpCode(HttpStatus.OK)
  answerCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
    @Body() dto: AnswerCallDto,
  ) {
    return this.callingService.answerCall(user.id, callId, dto.answerSdp);
  }

  @Post(':callId/decline')
  @HttpCode(HttpStatus.OK)
  declineCall(@CurrentUser() user: AuthenticatedUser, @Param('callId') callId: string) {
    return this.callingService.declineCall(user.id, callId);
  }

  @Post(':callId/end')
  @HttpCode(HttpStatus.OK)
  endCall(@CurrentUser() user: AuthenticatedUser, @Param('callId') callId: string) {
    return this.callingService.endCall(user.id, callId);
  }

  @Post(':callId/ice-candidates')
  @HttpCode(HttpStatus.CREATED)
  submitIceCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
    @Body() dto: SubmitIceCandidateDto,
  ) {
    return this.callingService.submitIceCandidate(user.id, callId, dto.candidate);
  }

  @Get(':callId/ice-candidates')
  listIceCandidates(@CurrentUser() user: AuthenticatedUser, @Param('callId') callId: string) {
    return this.callingService.listIceCandidatesFromPeer(user.id, callId);
  }

  @Get('virtual-backgrounds/catalog')
  getVirtualBackgroundCatalog() {
    return VIRTUAL_BACKGROUNDS;
  }

  @Put(':callId/virtual-background')
  @HttpCode(HttpStatus.OK)
  setVirtualBackground(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
    @Body() dto: SetVirtualBackgroundDto,
  ) {
    return this.callingService.setVirtualBackground(user.id, callId, dto.backgroundId);
  }

  @Get('appearance-filters/catalog')
  getAppearanceFilterCatalog() {
    return APPEARANCE_FILTERS;
  }

  @Put(':callId/appearance-filter')
  @HttpCode(HttpStatus.OK)
  setAppearanceFilter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
    @Body() dto: SetAppearanceFilterDto,
  ) {
    return this.callingService.setAppearanceFilter(user.id, callId, dto.filterId);
  }

  @Put(':callId/icebreaker')
  @HttpCode(HttpStatus.OK)
  setIcebreakerOverlay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
    @Body() dto: SetIcebreakerOverlayDto,
  ) {
    return this.callingService.setIcebreakerOverlay(user.id, callId, dto.promptId);
  }

  @Put(':callId/media-controls')
  @HttpCode(HttpStatus.OK)
  setMediaControls(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
    @Body() dto: SetMediaControlsDto,
  ) {
    return this.callingService.setMediaControls(user.id, callId, dto);
  }

  @Post(':callId/moderation-check')
  @HttpCode(HttpStatus.OK)
  checkTranscript(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
    @Body() dto: CheckTranscriptDto,
  ) {
    return this.callingService.checkTranscript(user.id, callId, dto.transcriptSnippet);
  }

  @Post(':callId/report')
  @HttpCode(HttpStatus.CREATED)
  reportCall(@CurrentUser() user: AuthenticatedUser, @Param('callId') callId: string, @Body() dto: ReportCallDto) {
    return this.callingService.reportCall(user.id, callId, dto.reason, dto.details);
  }
}
