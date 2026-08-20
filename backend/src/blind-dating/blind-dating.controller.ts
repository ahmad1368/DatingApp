import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendBlindDateMessageDto } from './dto/send-blind-date-message.dto';
import { BlindDatingService } from './blind-dating.service';

@Controller('blind-dating')
@UseGuards(JwtAuthGuard)
export class BlindDatingController {
  constructor(private readonly blindDatingService: BlindDatingService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.blindDatingService.getStatus(user.id);
  }

  @Post('queue/join')
  @HttpCode(HttpStatus.OK)
  joinQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.blindDatingService.joinQueue(user.id);
  }

  @Post('queue/leave')
  @HttpCode(HttpStatus.OK)
  leaveQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.blindDatingService.leaveQueue(user.id);
  }

  @Get('sessions/:sessionId/messages')
  listMessages(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.blindDatingService.listMessages(user.id, sessionId);
  }

  @Post('sessions/:sessionId/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendBlindDateMessageDto,
  ) {
    return this.blindDatingService.sendMessage(user.id, sessionId, dto.content);
  }

  @Post('sessions/:sessionId/reveal')
  @HttpCode(HttpStatus.OK)
  requestReveal(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.blindDatingService.requestReveal(user.id, sessionId);
  }
}
