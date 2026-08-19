import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnswerCallDto } from './dto/answer-call.dto';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { SubmitIceCandidateDto } from './dto/submit-ice-candidate.dto';
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
}
