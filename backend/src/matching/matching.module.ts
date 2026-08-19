import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [AuthModule],
  controllers: [MatchingController],
  providers: [MatchingService],
})
export class MatchingModule {}
