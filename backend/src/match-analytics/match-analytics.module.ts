import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchAnalyticsController } from './match-analytics.controller';
import { MatchAnalyticsService } from './match-analytics.service';

@Module({
  imports: [AuthModule],
  controllers: [MatchAnalyticsController],
  providers: [MatchAnalyticsService],
})
export class MatchAnalyticsModule {}
