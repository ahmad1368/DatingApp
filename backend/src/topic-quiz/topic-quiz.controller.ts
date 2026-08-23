import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmitTopicQuizDto } from './dto/submit-topic-quiz.dto';
import { TopicQuizService } from './topic-quiz.service';

@Controller('topic-quiz')
export class TopicQuizController {
  constructor(private readonly topicQuizService: TopicQuizService) {}

  @Get('questions')
  getQuestions() {
    return this.topicQuizService.getQuestions();
  }

  @Post('responses')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  submitQuiz(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitTopicQuizDto) {
    return this.topicQuizService.submitQuiz(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyResponses(@CurrentUser() user: AuthenticatedUser) {
    return this.topicQuizService.getMyResponses(user.id);
  }

  @Get('alignment/:otherUserId')
  @UseGuards(JwtAuthGuard)
  getAlignment(@CurrentUser() user: AuthenticatedUser, @Param('otherUserId') otherUserId: string) {
    return this.topicQuizService.getAlignment(user.id, otherUserId);
  }
}
