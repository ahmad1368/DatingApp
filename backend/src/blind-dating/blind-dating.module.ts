import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlindDatingController } from './blind-dating.controller';
import { BlindDatingService } from './blind-dating.service';

@Module({
  imports: [AuthModule],
  controllers: [BlindDatingController],
  providers: [BlindDatingService],
})
export class BlindDatingModule {}
