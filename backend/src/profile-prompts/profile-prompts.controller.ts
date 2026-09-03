import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordTextAnswerDto } from './dto/record-text-answer.dto';
import { RecordVideoAnswerDto } from './dto/record-video-answer.dto';
import { RecordVoiceAnswerDto } from './dto/record-voice-answer.dto';
import { ReactToVoicePromptDto } from './dto/react-to-voice-prompt.dto';
import { ReactToPhotoDto } from './dto/react-to-photo.dto';
import { TranslatePromptAnswerDto } from './dto/translate-prompt-answer.dto';
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

  @Get('video/me')
  getMyVideoAnswers(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePromptsService.getVideoAnswers(user.id);
  }

  @Get('video/:userId')
  getUserVideoAnswers(@Param('userId') userId: string) {
    return this.profilePromptsService.getVideoAnswers(userId);
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

  @Post(':promptId/reactions')
  @HttpCode(HttpStatus.CREATED)
  reactToVoicePrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('promptId') promptId: string,
    @Body() dto: ReactToVoicePromptDto,
  ) {
    return this.profilePromptsService.reactToVoicePrompt(
      user.id,
      dto.targetUserId,
      promptId,
      dto.comment,
      dto.audioReplyUrl,
      dto.durationSeconds,
    );
  }

  @Get(':promptId/reactions')
  listReactions(@CurrentUser() user: AuthenticatedUser, @Param('promptId') promptId: string) {
    return this.profilePromptsService.listReactions(user.id, promptId);
  }

  @Post('photos/:photoId/reactions')
  @HttpCode(HttpStatus.CREATED)
  reactToPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('photoId') photoId: string,
    @Body() dto: ReactToPhotoDto,
  ) {
    return this.profilePromptsService.reactToPhoto(
      user.id,
      dto.targetUserId,
      photoId,
      dto.comment,
      dto.audioReplyUrl,
      dto.durationSeconds,
    );
  }

  @Get('photos/:photoId/reactions')
  listPhotoReactions(@CurrentUser() user: AuthenticatedUser, @Param('photoId') photoId: string) {
    return this.profilePromptsService.listPhotoReactions(user.id, photoId);
  }

  @Post('video-answers')
  @HttpCode(HttpStatus.OK)
  recordVideoAnswer(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordVideoAnswerDto) {
    return this.profilePromptsService.recordVideoAnswer(
      user.id,
      dto.promptId,
      dto.videoUrl,
      dto.durationSeconds,
    );
  }

  @Delete('video-answers/:promptId')
  @HttpCode(HttpStatus.OK)
  deleteVideoAnswer(@CurrentUser() user: AuthenticatedUser, @Param('promptId') promptId: string) {
    return this.profilePromptsService.deleteVideoAnswer(user.id, promptId);
  }

  @Get('text/me')
  getMyTextAnswers(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePromptsService.getTextAnswers(user.id);
  }

  @Get('text/:userId')
  getUserTextAnswers(@Param('userId') userId: string) {
    return this.profilePromptsService.getTextAnswers(userId);
  }

  @Post('text-answers')
  @HttpCode(HttpStatus.OK)
  recordTextAnswer(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordTextAnswerDto) {
    return this.profilePromptsService.recordTextAnswer(user.id, dto.promptId, dto.answer);
  }

  @Delete('text-answers/:promptId')
  @HttpCode(HttpStatus.OK)
  deleteTextAnswer(@CurrentUser() user: AuthenticatedUser, @Param('promptId') promptId: string) {
    return this.profilePromptsService.deleteTextAnswer(user.id, promptId);
  }

  @Post('text/:userId/:promptId/translate')
  @HttpCode(HttpStatus.OK)
  translateTextAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('promptId') promptId: string,
    @Body() dto: TranslatePromptAnswerDto,
  ) {
    return this.profilePromptsService.translateTextAnswer(user.id, userId, promptId, dto.targetLanguage);
  }

  @Post(':userId/:promptId/translate')
  @HttpCode(HttpStatus.OK)
  translateVoiceAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('promptId') promptId: string,
    @Body() dto: TranslatePromptAnswerDto,
  ) {
    return this.profilePromptsService.translateVoiceAnswer(user.id, userId, promptId, dto.targetLanguage);
  }

  @Post('video/:userId/:promptId/translate')
  @HttpCode(HttpStatus.OK)
  translateVideoAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('promptId') promptId: string,
    @Body() dto: TranslatePromptAnswerDto,
  ) {
    return this.profilePromptsService.translateVideoAnswer(user.id, userId, promptId, dto.targetLanguage);
  }
}
