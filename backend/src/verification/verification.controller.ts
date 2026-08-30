import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmitSelfieDto } from './dto/submit-selfie.dto';
import { VerificationService } from './verification.service';

@Controller('verification/selfie')
@UseGuards(JwtAuthGuard)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.getVerificationStatus(user.id);
  }

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  requestChallenge(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.requestChallenge(user.id);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  submitSelfie(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitSelfieDto) {
    return this.verificationService.submitSelfie(user.id, dto.challengeId, dto.selfieImageBase64);
  }
}
