import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetHideFromMutualConnectionsDto } from './dto/set-hide-from-mutual-connections.dto';
import { SyncSocialContactsDto } from './dto/sync-social-contacts.dto';
import { SocialGraphService } from './social-graph.service';

@Controller('social-graph')
@UseGuards(JwtAuthGuard)
export class SocialGraphController {
  constructor(private readonly socialGraphService: SocialGraphService) {}

  @Post('contacts')
  @HttpCode(HttpStatus.OK)
  syncContacts(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncSocialContactsDto) {
    return this.socialGraphService.syncContacts(user.id, dto.contacts);
  }

  @Get('mutual/:otherUserId')
  getMutualConnections(
    @CurrentUser() user: AuthenticatedUser,
    @Param('otherUserId') otherUserId: string,
  ) {
    return this.socialGraphService.getMutualConnections(user.id, otherUserId);
  }

  @Put('hide-from-mutual-connections')
  @HttpCode(HttpStatus.OK)
  setHideFromMutualConnections(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetHideFromMutualConnectionsDto,
  ) {
    return this.socialGraphService.setHideFromMutualConnections(user.id, dto.enabled);
  }
}
