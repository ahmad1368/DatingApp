import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfirmWorkVerificationDto } from './dto/confirm-work-verification.dto';
import { RequestWorkVerificationDto } from './dto/request-work-verification.dto';
import { WorkVerificationService } from './work-verification.service';

@Controller('work-verification')
@UseGuards(JwtAuthGuard)
export class WorkVerificationController {
  constructor(private readonly workVerificationService: WorkVerificationService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.workVerificationService.getStatus(user.id);
  }

  @Post('request')
  @HttpCode(HttpStatus.OK)
  requestVerification(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestWorkVerificationDto) {
    return this.workVerificationService.requestVerification(
      user.id,
      dto.type,
      dto.email,
      dto.jobTitle,
      dto.company,
      dto.school,
    );
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirmVerification(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmWorkVerificationDto) {
    return this.workVerificationService.confirmVerification(user.id, dto.code);
  }
}
