import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordSwipeDto } from './dto/record-swipe.dto';
import { DiscoveryService } from './discovery.service';

@Controller('discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('deck')
  getDeck(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.getDeck(user.id);
  }

  @Post('swipe')
  @HttpCode(HttpStatus.OK)
  recordSwipe(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordSwipeDto) {
    return this.discoveryService.recordSwipe(user.id, dto.targetUserId, dto.action);
  }
}
