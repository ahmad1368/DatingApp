import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RedeemReferralCodeDto } from './dto/redeem-referral-code.dto';
import { VipReferralService } from './vip-referral.service';

@Controller('vetting/vip-referral-codes')
@UseGuards(JwtAuthGuard)
export class VipReferralController {
  constructor(private readonly vipReferralService: VipReferralService) {}

  @Get()
  listMyVipCodes(@CurrentUser() user: AuthenticatedUser) {
    return this.vipReferralService.listMyVipCodes(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  generateVipCode(@CurrentUser() user: AuthenticatedUser) {
    return this.vipReferralService.generateVipCode(user.id);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  redeemVipCode(@CurrentUser() user: AuthenticatedUser, @Body() dto: RedeemReferralCodeDto) {
    return this.vipReferralService.redeemVipCode(user.id, dto.code);
  }
}
