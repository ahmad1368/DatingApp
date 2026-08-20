import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetVideoSnippetDto } from './dto/set-video-snippet.dto';
import { VideoSnippetService } from './video-snippet.service';

@Controller('profile/video-snippet')
@UseGuards(JwtAuthGuard)
export class VideoSnippetController {
  constructor(private readonly videoSnippetService: VideoSnippetService) {}

  @Get()
  getVideoSnippet(@CurrentUser() user: AuthenticatedUser) {
    return this.videoSnippetService.getVideoSnippet(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  setVideoSnippet(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetVideoSnippetDto) {
    return this.videoSnippetService.setVideoSnippet(user.id, dto.url);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clearVideoSnippet(@CurrentUser() user: AuthenticatedUser) {
    return this.videoSnippetService.clearVideoSnippet(user.id);
  }
}
