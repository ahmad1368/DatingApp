import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmitPostMatchSurveyDto } from './dto/submit-post-match-survey.dto';
import { PostMatchSurveyService } from './post-match-survey.service';

@Controller('post-match-survey')
@UseGuards(JwtAuthGuard)
export class PostMatchSurveyController {
  constructor(private readonly postMatchSurveyService: PostMatchSurveyService) {}

  @Put(':matchId')
  @HttpCode(HttpStatus.OK)
  submitSurvey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @Body() dto: SubmitPostMatchSurveyDto,
  ) {
    return this.postMatchSurveyService.submitSurvey(user.id, matchId, dto.metInPerson, dto.matchQuality);
  }

  @Get(':matchId')
  getMySurvey(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.postMatchSurveyService.getMySurvey(user.id, matchId);
  }
}
