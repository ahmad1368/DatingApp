import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConnectSpotifyDto } from './dto/connect-spotify.dto';
import { SetAnthemDto } from './dto/set-anthem.dto';
import { SpotifySyncService } from './spotify-sync.service';

@Controller('profile/spotify')
@UseGuards(JwtAuthGuard)
export class SpotifyController {
  constructor(private readonly spotifySyncService: SpotifySyncService) {}

  @Get('connect-url')
  getConnectUrl() {
    return { url: this.spotifySyncService.getAuthorizeUrl() };
  }

  @Get()
  getConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.spotifySyncService.getConnection(user.id);
  }

  @Get('compatibility/:otherUserId')
  getMusicCompatibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('otherUserId') otherUserId: string,
  ) {
    return this.spotifySyncService.getMusicCompatibility(user.id, otherUserId);
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectSpotifyDto) {
    return this.spotifySyncService.connect(user.id, dto.code);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.spotifySyncService.syncTopArtists(user.id);
  }

  @Put('anthem')
  @HttpCode(HttpStatus.OK)
  setAnthem(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAnthemDto) {
    return this.spotifySyncService.setAnthem(user.id, dto.trackId);
  }

  @Delete('anthem')
  @HttpCode(HttpStatus.OK)
  clearAnthem(@CurrentUser() user: AuthenticatedUser) {
    return this.spotifySyncService.clearAnthem(user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.spotifySyncService.disconnect(user.id);
  }
}
