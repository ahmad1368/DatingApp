import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DecideApplicationDto } from './dto/decide-application.dto';
import { ReferApplicantDto } from './dto/refer-applicant.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { RedeemReferralCodeDto } from './dto/redeem-referral-code.dto';
import { VettingService } from './vetting.service';

@Controller('vetting')
@UseGuards(JwtAuthGuard)
export class VettingController {
  constructor(private readonly vettingService: VettingService) {}

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitApplicationDto) {
    return this.vettingService.apply(user.id, dto.socialLinks);
  }

  @Get('me')
  getMyApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.vettingService.getMyApplication(user.id);
  }

  @Post('referrals')
  @HttpCode(HttpStatus.OK)
  refer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReferApplicantDto) {
    return this.vettingService.refer(user.id, dto.applicantUserId);
  }

  @Get('referral-code')
  getMyReferralCode(@CurrentUser() user: AuthenticatedUser) {
    return this.vettingService.getMyReferralCode(user.id);
  }

  @Post('referral-code/redeem')
  @HttpCode(HttpStatus.OK)
  redeemReferralCode(@CurrentUser() user: AuthenticatedUser, @Body() dto: RedeemReferralCodeDto) {
    return this.vettingService.redeemReferralCode(user.id, dto.code);
  }

  @Get('queue')
  listQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.vettingService.listQueue(user.id);
  }

  @Post('applications/:applicationId/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: DecideApplicationDto,
  ) {
    return this.vettingService.decide(user.id, applicationId, dto.decision, dto.reason);
  }
}
