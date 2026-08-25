import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DecideRoundDto } from './dto/decide-round.dto';
import { SubmitIceCandidateDto } from './dto/submit-ice-candidate.dto';
import { SubmitSdpDto } from './dto/submit-sdp.dto';
import { SpeedDatingService } from './speed-dating.service';

@Controller('speed-dating')
@UseGuards(JwtAuthGuard)
export class SpeedDatingController {
  constructor(private readonly speedDatingService: SpeedDatingService) {}

  @Get('schedule')
  getEventSchedule() {
    return this.speedDatingService.getEventSchedule();
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.speedDatingService.getStatus(user.id);
  }

  @Post('queue/join')
  @HttpCode(HttpStatus.OK)
  joinQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.speedDatingService.joinQueue(user.id);
  }

  @Post('queue/leave')
  @HttpCode(HttpStatus.OK)
  leaveQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.speedDatingService.leaveQueue(user.id);
  }

  @Post('rounds/:roundId/offer')
  @HttpCode(HttpStatus.OK)
  submitOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roundId') roundId: string,
    @Body() dto: SubmitSdpDto,
  ) {
    return this.speedDatingService.submitOffer(user.id, roundId, dto.sdp);
  }

  @Post('rounds/:roundId/answer')
  @HttpCode(HttpStatus.OK)
  submitAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roundId') roundId: string,
    @Body() dto: SubmitSdpDto,
  ) {
    return this.speedDatingService.submitAnswer(user.id, roundId, dto.sdp);
  }

  @Post('rounds/:roundId/ice-candidates')
  @HttpCode(HttpStatus.CREATED)
  submitIceCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roundId') roundId: string,
    @Body() dto: SubmitIceCandidateDto,
  ) {
    return this.speedDatingService.submitIceCandidate(user.id, roundId, dto.candidate);
  }

  @Get('rounds/:roundId/ice-candidates')
  listIceCandidates(@CurrentUser() user: AuthenticatedUser, @Param('roundId') roundId: string) {
    return this.speedDatingService.listIceCandidatesFromPeer(user.id, roundId);
  }

  @Post('rounds/:roundId/decision')
  @HttpCode(HttpStatus.OK)
  decideRound(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roundId') roundId: string,
    @Body() dto: DecideRoundDto,
  ) {
    return this.speedDatingService.decideRound(user.id, roundId, dto.wantsMatch);
  }
}
