import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetOpeningQuestionDto } from './dto/set-opening-question.dto';
import { OPENING_QUESTIONS } from './opening-question.constants';
import { OpeningQuestionService } from './opening-question.service';

@Controller('profile/opening-question')
@UseGuards(JwtAuthGuard)
export class OpeningQuestionController {
  constructor(private readonly openingQuestionService: OpeningQuestionService) {}

  @Get('catalog')
  getCatalog() {
    return OPENING_QUESTIONS;
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  setOpeningQuestion(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetOpeningQuestionDto) {
    return this.openingQuestionService.setOpeningQuestion(user.id, dto.questionId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clearOpeningQuestion(@CurrentUser() user: AuthenticatedUser) {
    return this.openingQuestionService.clearOpeningQuestion(user.id);
  }

  @Get(':targetUserId')
  getOpeningQuestion(@Param('targetUserId') targetUserId: string) {
    return this.openingQuestionService.getOpeningQuestion(targetUserId);
  }
}
