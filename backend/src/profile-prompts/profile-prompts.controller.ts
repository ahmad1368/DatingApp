import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordVoiceAnswerDto } from './dto/record-voice-answer.dto';
import { ProfilePromptsService } from './profile-prompts.service';

@Controller('profile-prompts')
@UseGuards(JwtAuthGuard)
export class ProfilePromptsController {
  constructor(private readonly profilePromptsService: ProfilePromptsService) {}

  @Get('items')
  getPrompts() {
    return this.profilePromptsService.getPrompts();
  }

  @Get('me')
  getMyAnswers(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePromptsService.getAnswers(user.id);
  }

  @Get(':userId')
  getUserAnswers(@Param('userId') userId: string) {
    return this.profilePromptsService.getAnswers(userId);
  }

  @Post('answers')
  @HttpCode(HttpStatus.OK)
  recordAnswer(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordVoiceAnswerDto) {
    return this.profilePromptsService.recordAnswer(
      user.id,
      dto.promptId,
      dto.audioUrl,
      dto.durationSeconds,
    );
  }

  @Delete('answers/:promptId')
  @HttpCode(HttpStatus.OK)
  deleteAnswer(@CurrentUser() user: AuthenticatedUser, @Param('promptId') promptId: string) {
    return this.profilePromptsService.deleteAnswer(user.id, promptId);
  }
}
