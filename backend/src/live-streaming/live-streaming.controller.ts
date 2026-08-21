import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PostStreamCommentDto } from './dto/post-stream-comment.dto';
import { SendStreamGiftDto } from './dto/send-stream-gift.dto';
import { StartStreamDto } from './dto/start-stream.dto';
import { LiveStreamingService } from './live-streaming.service';

@Controller('live-streams')
@UseGuards(JwtAuthGuard)
export class LiveStreamingController {
  constructor(private readonly liveStreamingService: LiveStreamingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  startStream(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartStreamDto) {
    return this.liveStreamingService.startStream(user.id, dto.title);
  }

  @Get()
  listLiveStreams() {
    return this.liveStreamingService.listLiveStreams();
  }

  @Get(':streamId')
  getStream(@Param('streamId') streamId: string) {
    return this.liveStreamingService.getStream(streamId);
  }

  @Post(':streamId/end')
  @HttpCode(HttpStatus.OK)
  endStream(@CurrentUser() user: AuthenticatedUser, @Param('streamId') streamId: string) {
    return this.liveStreamingService.endStream(user.id, streamId);
  }

  @Post(':streamId/view')
  @HttpCode(HttpStatus.OK)
  recordView(@Param('streamId') streamId: string) {
    return this.liveStreamingService.recordView(streamId);
  }

  @Post(':streamId/like')
  @HttpCode(HttpStatus.OK)
  likeStream(@Param('streamId') streamId: string) {
    return this.liveStreamingService.likeStream(streamId);
  }

  @Get(':streamId/comments')
  listComments(@Param('streamId') streamId: string) {
    return this.liveStreamingService.listComments(streamId);
  }

  @Post(':streamId/comments')
  @HttpCode(HttpStatus.CREATED)
  postComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('streamId') streamId: string,
    @Body() dto: PostStreamCommentDto,
  ) {
    return this.liveStreamingService.postComment(user.id, streamId, dto.text);
  }

  @Post(':streamId/gift')
  @HttpCode(HttpStatus.CREATED)
  sendGift(
    @CurrentUser() user: AuthenticatedUser,
    @Param('streamId') streamId: string,
    @Body() dto: SendStreamGiftDto,
  ) {
    return this.liveStreamingService.sendGift(user.id, streamId, dto.giftId, dto.message);
  }
}
