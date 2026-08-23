import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportViolationDto } from './dto/report-violation.dto';
import { ScreenSecurityService } from './screen-security.service';

@Controller('screen-security')
@UseGuards(JwtAuthGuard)
export class ScreenSecurityController {
  constructor(private readonly screenSecurityService: ScreenSecurityService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.screenSecurityService.getStatus(user.id);
  }

  @Post('violations')
  reportViolation(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReportViolationDto) {
    return this.screenSecurityService.reportViolation(user.id, dto.context);
  }
}
