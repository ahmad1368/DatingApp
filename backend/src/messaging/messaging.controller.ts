import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { SendMediaMessageDto } from './dto/send-media-message.dto';
import { CheckMessageDto } from './dto/check-message.dto';
import { ReportMessageDto } from './dto/report-message.dto';
import { ReportAndUnmatchDto } from './dto/report-and-unmatch.dto';
import { SetReadReceiptsDto } from './dto/set-read-receipts.dto';
import { SetMediaBlurPreferenceDto } from './dto/set-media-blur-preference.dto';
import { SendIcebreakerDto } from './dto/send-icebreaker.dto';
import { RespondIcebreakerDto } from './dto/respond-icebreaker.dto';
import { SendPollDto } from './dto/send-poll.dto';
import { RespondPollDto } from './dto/respond-poll.dto';
import { SendVoiceNoteDto } from './dto/send-voice-note.dto';
import { SetMatchNoteDto } from './dto/set-match-note.dto';
import { GifSearchService } from './gif-search.service';
import { MessagingService } from './messaging.service';
import { MessageModerationService } from './message-moderation.service';
import { RelationshipCoachService } from '../relationship-coach/relationship-coach.service';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly gifSearchService: GifSearchService,
    private readonly messageModerationService: MessageModerationService,
    private readonly relationshipCoachService: RelationshipCoachService,
  ) {}

  @Get()
  listMyMatches(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listMyMatches(user.id);
  }

  @Get('gifs/search')
  searchGifs(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.gifSearchService.search(q, limit ? Number(limit) : undefined);
  }

  @Get('icebreaker-prompts')
  getIcebreakerPrompts() {
    return this.messagingService.getIcebreakerPrompts();
  }

  /**
   * A single curated icebreaker prompt to nudge a fresh match into playing,
   * surfaced only while the match is still inside its first-message window
   * and neither side has sent one yet - see
   * MessagingService.getSuggestedIcebreaker.
   */
  @Get(':matchId/suggested-icebreaker')
  getSuggestedIcebreaker(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.getSuggestedIcebreaker(user.id, matchId);
  }

  @Get('voice-note-effects')
  getVoiceNoteEffects() {
    return this.messagingService.getVoiceNoteEffectsCatalog();
  }

  @Get('partner/:partnerId')
  listSharedMatches(@CurrentUser() user: AuthenticatedUser, @Param('partnerId') partnerId: string) {
    return this.messagingService.listSharedMatches(user.id, partnerId);
  }

  @Get('partner/:partnerId/:matchId/messages')
  listSharedMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId') partnerId: string,
    @Param('matchId') matchId: string,
  ) {
    return this.messagingService.listSharedMessages(user.id, partnerId, matchId);
  }

  @Get('reconnectable')
  listReconnectableMatches(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listReconnectableMatches(user.id);
  }

  @Post('reconnect/:dissolvedMatchId')
  @HttpCode(HttpStatus.OK)
  reconnectMatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dissolvedMatchId') dissolvedMatchId: string,
  ) {
    return this.messagingService.reconnectMatch(user.id, dissolvedMatchId);
  }

  @Get('archived')
  listArchivedThreads(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listArchivedThreads(user.id);
  }

  @Get('archived/:dissolvedMatchId/messages')
  getArchivedThreadMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dissolvedMatchId') dissolvedMatchId: string,
  ) {
    return this.messagingService.getArchivedThreadMessages(user.id, dissolvedMatchId);
  }

  @Put('read-receipts')
  @HttpCode(HttpStatus.OK)
  setReadReceiptsEnabled(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetReadReceiptsDto) {
    return this.messagingService.setReadReceiptsEnabled(user.id, dto.enabled);
  }

  @Get('media-blur-preference')
  getMediaBlurPreference(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.getMediaBlurPreference(user.id);
  }

  @Put('media-blur-preference')
  @HttpCode(HttpStatus.OK)
  setMediaBlurPreference(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetMediaBlurPreferenceDto) {
    return this.messagingService.setMediaBlurPreference(user.id, dto.enabled);
  }

  /**
   * Heartbeat the client calls while the app is in active use, so matches
   * can see roughly how recently this user was active - automatically
   * withheld from a match whose chat has gone quiet for a week, see
   * GHOSTING_PROTECTION_INACTIVITY_DAYS.
   */
  @Put('activity-ping')
  @HttpCode(HttpStatus.OK)
  recordActivity(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.recordActivity(user.id);
  }

  @Post('moderation/check')
  @HttpCode(HttpStatus.OK)
  checkMessage(@Body() dto: CheckMessageDto) {
    return this.messageModerationService.checkText(dto.text);
  }

  @Get(':matchId')
  getStatus(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.getMatchStatus(user.id, matchId);
  }

  @Get(':matchId/messages')
  listMessages(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.listMessages(user.id, matchId);
  }

  @Get(':matchId/note')
  getMatchNote(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.getMatchNote(user.id, matchId);
  }

  /**
   * AI-suggested opening lines for this specific match, based on shared
   * interests and compatibility-questionnaire overlap - see
   * RelationshipCoachService.getIcebreakerSuggestions.
   */
  @Get(':matchId/icebreaker-suggestions')
  getIcebreakerSuggestions(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.relationshipCoachService.getIcebreakerSuggestions(user.id, matchId);
  }

  @Put(':matchId/note')
  @HttpCode(HttpStatus.OK)
  setMatchNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: SetMatchNoteDto,
  ) {
    return this.messagingService.setMatchNote(user.id, matchId, dto.content);
  }

  @Post(':matchId/extend')
  @HttpCode(HttpStatus.OK)
  extendMatchTimeLimit(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.extendMatchTimeLimit(user.id, matchId);
  }

  @Post(':matchId/unmatch')
  @HttpCode(HttpStatus.OK)
  unmatch(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.unmatch(user.id, matchId);
  }

  @Post(':matchId/report-and-unmatch')
  @HttpCode(HttpStatus.CREATED)
  reportAndUnmatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: ReportAndUnmatchDto,
  ) {
    return this.messageModerationService.reportAndUnmatch(user.id, matchId, dto.reason, dto.details);
  }

  @Post(':matchId/request-verification')
  @HttpCode(HttpStatus.OK)
  requestVerification(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.requestVerification(user.id, matchId);
  }

  @Post(':matchId/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(user.id, matchId, dto.content);
  }

  @Post(':matchId/media')
  @HttpCode(HttpStatus.CREATED)
  sendMediaMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: SendMediaMessageDto,
  ) {
    return this.messagingService.sendMediaMessage(
      user.id,
      matchId,
      dto.contentType,
      dto.mediaUrl,
      dto.expiryMode,
      dto.viewTimerSeconds,
    );
  }

  @Post(':matchId/voice-note')
  @HttpCode(HttpStatus.CREATED)
  sendVoiceNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: SendVoiceNoteDto,
  ) {
    return this.messagingService.sendVoiceNote(
      user.id,
      matchId,
      dto.mediaUrl,
      dto.durationSeconds,
      dto.voiceEffectId,
      dto.backgroundSoundId,
    );
  }

  @Post(':matchId/icebreaker')
  @HttpCode(HttpStatus.CREATED)
  sendIcebreaker(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: SendIcebreakerDto,
  ) {
    return this.messagingService.sendIcebreaker(user.id, matchId, dto.promptId);
  }

  @Post(':matchId/messages/:messageId/icebreaker-response')
  @HttpCode(HttpStatus.OK)
  respondToIcebreaker(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Param('messageId') messageId: string,
    @Body() dto: RespondIcebreakerDto,
  ) {
    return this.messagingService.respondToIcebreaker(user.id, matchId, messageId, dto.optionIndex);
  }

  @Post(':matchId/poll')
  @HttpCode(HttpStatus.CREATED)
  sendPoll(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string, @Body() dto: SendPollDto) {
    return this.messagingService.sendPoll(user.id, matchId, dto.question, dto.options);
  }

  @Post(':matchId/messages/:messageId/poll-response')
  @HttpCode(HttpStatus.OK)
  respondToPoll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Param('messageId') messageId: string,
    @Body() dto: RespondPollDto,
  ) {
    return this.messagingService.respondToPoll(user.id, matchId, messageId, dto.optionIndex);
  }

  @Post(':matchId/messages/:messageId/reveal')
  @HttpCode(HttpStatus.OK)
  revealImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagingService.revealImage(user.id, matchId, messageId);
  }

  @Post(':matchId/messages/:messageId/view')
  @HttpCode(HttpStatus.OK)
  viewEphemeralMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagingService.viewEphemeralMedia(user.id, matchId, messageId);
  }

  @Post(':matchId/messages/:messageId/report')
  @HttpCode(HttpStatus.CREATED)
  reportMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReportMessageDto,
  ) {
    return this.messageModerationService.reportMessage(user.id, matchId, messageId, dto.reason);
  }
}
