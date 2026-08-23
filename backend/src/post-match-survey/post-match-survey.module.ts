import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PostMatchSurveyController } from './post-match-survey.controller';
import { PostMatchSurveyService } from './post-match-survey.service';

@Module({
  imports: [AuthModule],
  controllers: [PostMatchSurveyController],
  providers: [PostMatchSurveyService],
})
export class PostMatchSurveyModule {}
