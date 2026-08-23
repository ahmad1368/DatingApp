import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TopicQuizController } from './topic-quiz.controller';
import { TopicQuizService } from './topic-quiz.service';

@Module({
  imports: [AuthModule],
  controllers: [TopicQuizController],
  providers: [TopicQuizService],
})
export class TopicQuizModule {}
