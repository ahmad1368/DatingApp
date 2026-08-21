import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ATTACHMENT_STYLES, LOVE_LANGUAGES } from './love-style.constants';
import { SetLoveStyleDto } from './dto/set-love-style.dto';
import { LoveStyleService } from './love-style.service';

@Controller('profile/love-style')
export class LoveStyleController {
  constructor(private readonly loveStyleService: LoveStyleService) {}

  @Get('catalog')
  getCatalog() {
    return { loveLanguages: LOVE_LANGUAGES, attachmentStyles: ATTACHMENT_STYLES };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getLoveStyle(@CurrentUser() user: AuthenticatedUser) {
    return this.loveStyleService.getLoveStyle(user.id);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setLoveStyle(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetLoveStyleDto) {
    return this.loveStyleService.setLoveStyle(user.id, dto);
  }
}
