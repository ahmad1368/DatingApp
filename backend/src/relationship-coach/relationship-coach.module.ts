import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { MatchingModule } from '../matching/matching.module';
import { RelationshipCoachController } from './relationship-coach.controller';
import { RelationshipCoachService } from './relationship-coach.service';
import { AI_COACH_PROVIDER } from './interfaces/ai-coach-provider.interface';
import { OpenAiCoachClient } from './providers/openai-coach.client';

@Module({
  imports: [AuthModule, ConfigModule, MatchingModule],
  controllers: [RelationshipCoachController],
  providers: [
    RelationshipCoachService,
    {
      provide: AI_COACH_PROVIDER,
      useClass: OpenAiCoachClient,
    },
  ],
  exports: [RelationshipCoachService],
})
export class RelationshipCoachModule {}
