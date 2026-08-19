import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagingService } from './messaging.service';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get()
  listMyMatches(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listMyMatches(user.id);
  }

  @Get(':matchId')
  getStatus(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.getMatchStatus(user.id, matchId);
  }

  @Get(':matchId/messages')
  listMessages(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.messagingService.listMessages(user.id, matchId);
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
}
