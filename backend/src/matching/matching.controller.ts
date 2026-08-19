import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { MatchingService } from './matching.service';

@Controller('questionnaire')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('questions')
  listQuestions() {
    return this.matchingService.listQuestions();
  }

  @Post('answers')
  @HttpCode(HttpStatus.OK)
  submitAnswer(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitAnswerDto) {
    return this.matchingService.submitAnswer(user.id, dto);
  }

  @Get('compatibility/:otherUserId')
  getCompatibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('otherUserId') otherUserId: string,
  ) {
    return this.matchingService.getCompatibility(user.id, otherUserId);
  }
}
