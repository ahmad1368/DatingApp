import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InviteCouplePairingDto } from './dto/invite-couple-pairing.dto';
import { SetActiveBrowsingPartnerDto } from './dto/set-active-browsing-partner.dto';
import { SetJointBrowsingModeDto } from './dto/set-joint-browsing-mode.dto';
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

  @Get('active-browsing')
  getActiveBrowsingPartner(@CurrentUser() user: AuthenticatedUser) {
    return this.couplePairingService.getActiveBrowsingPartner(user.id);
  }

  @Put('active-browsing')
  @HttpCode(HttpStatus.OK)
  setActiveBrowsingPartner(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetActiveBrowsingPartnerDto,
  ) {
    return this.couplePairingService.setActiveBrowsingPartner(user.id, dto.partnerId ?? null);
  }

  @Put(':partnerId/browsing-mode')
  @HttpCode(HttpStatus.OK)
  setJointBrowsingMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId') partnerId: string,
    @Body() dto: SetJointBrowsingModeDto,
  ) {
    return this.couplePairingService.setJointBrowsingMode(user.id, partnerId, dto.enabled);
  }
}
