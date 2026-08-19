import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConnectInstagramDto } from './dto/connect-instagram.dto';
import { InstagramSyncService } from './instagram-sync.service';

@Controller('profile/instagram')
@UseGuards(JwtAuthGuard)
export class InstagramController {
  constructor(private readonly instagramSyncService: InstagramSyncService) {}

  @Get('connect-url')
  getConnectUrl() {
    return { url: this.instagramSyncService.getAuthorizeUrl() };
  }

  @Get()
  getConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.instagramSyncService.getConnection(user.id);
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectInstagramDto) {
    return this.instagramSyncService.connect(user.id, dto.code);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.instagramSyncService.sync(user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.instagramSyncService.disconnect(user.id);
  }
}
