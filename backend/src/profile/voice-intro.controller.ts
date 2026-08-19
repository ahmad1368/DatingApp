import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetVoiceIntroDto } from './dto/set-voice-intro.dto';
import { VoiceIntroService } from './voice-intro.service';

@Controller('profile/voice-intro')
@UseGuards(JwtAuthGuard)
export class VoiceIntroController {
  constructor(private readonly voiceIntroService: VoiceIntroService) {}

  @Get()
  getVoiceIntro(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceIntroService.getVoiceIntro(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  setVoiceIntro(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetVoiceIntroDto) {
    return this.voiceIntroService.setVoiceIntro(user.id, dto.url, dto.durationSeconds);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clearVoiceIntro(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceIntroService.clearVoiceIntro(user.id);
  }
}
