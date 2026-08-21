import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetZodiacVisibilityDto } from './dto/set-zodiac-visibility.dto';
import { ZodiacService } from './zodiac.service';

@Controller('profile/zodiac')
@UseGuards(JwtAuthGuard)
export class ZodiacController {
  constructor(private readonly zodiacService: ZodiacService) {}

  @Get()
  getZodiac(@CurrentUser() user: AuthenticatedUser) {
    return this.zodiacService.getZodiac(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  setVisibility(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetZodiacVisibilityDto) {
    return this.zodiacService.setShowZodiacOnProfile(user.id, dto.showZodiacOnProfile);
  }
}
