import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PROMPT_QUESTIONS } from './profile-prompts.constants';
import { SetProfilePromptsDto } from './dto/set-profile-prompts.dto';
import { ProfilePromptsService } from './profile-prompts.service';

@Controller('profile/prompts')
export class ProfilePromptsController {
  constructor(private readonly profilePromptsService: ProfilePromptsService) {}

  @Get('catalog')
  getCatalog() {
    return { questions: PROMPT_QUESTIONS };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getPrompts(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePromptsService.getPrompts(user.id);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setPrompts(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetProfilePromptsDto) {
    return this.profilePromptsService.setPrompts(user.id, dto.prompts);
  }
}
