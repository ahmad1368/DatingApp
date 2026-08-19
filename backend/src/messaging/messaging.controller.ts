import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { SendMediaMessageDto } from './dto/send-media-message.dto';
import { GifSearchService } from './gif-search.service';
import { MessagingService } from './messaging.service';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly gifSearchService: GifSearchService,
  ) {}

  @Get()
  listMyMatches(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listMyMatches(user.id);
  }

  @Get('gifs/search')
  searchGifs(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.gifSearchService.search(q, limit ? Number(limit) : undefined);
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

  @Post(':matchId/media')
  @HttpCode(HttpStatus.CREATED)
  sendMediaMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: SendMediaMessageDto,
  ) {
    return this.messagingService.sendMediaMessage(user.id, matchId, dto.contentType, dto.mediaUrl);
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
}
