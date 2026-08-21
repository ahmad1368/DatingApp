import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InviteCouplePairingDto } from './dto/invite-couple-pairing.dto';
import { UnpairDto } from './dto/unpair.dto';
import { CouplePairingService } from './couple-pairing.service';

@Controller('couples')
@UseGuards(JwtAuthGuard)
export class CouplePairingController {
  constructor(private readonly couplePairingService: CouplePairingService) {}

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteCouplePairingDto) {
    return this.couplePairingService.invite(user.id, dto.partnerUserId);
  }

  @Get('invites')
  listIncoming(@CurrentUser() user: AuthenticatedUser) {
    return this.couplePairingService.listIncoming(user.id);
  }

  @Post(':pairingId/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('pairingId') pairingId: string) {
    return this.couplePairingService.respond(user.id, pairingId, true);
  }

  @Post(':pairingId/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthenticatedUser, @Param('pairingId') pairingId: string) {
    return this.couplePairingService.respond(user.id, pairingId, false);
  }

  @Get('partners')
  listPartners(@CurrentUser() user: AuthenticatedUser) {
    return this.couplePairingService.listPartners(user.id);
  }

  @Post('unpair')
  @HttpCode(HttpStatus.OK)
  unpair(@CurrentUser() user: AuthenticatedUser, @Body() dto: UnpairDto) {
    return this.couplePairingService.unpair(user.id, dto.partnerUserId);
  }
}
