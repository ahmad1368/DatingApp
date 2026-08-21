import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GiftingModule } from '../gifting/gifting.module';
import { LiveStreamingController } from './live-streaming.controller';
import { LiveStreamingService } from './live-streaming.service';

@Module({
  imports: [AuthModule, GiftingModule],
  controllers: [LiveStreamingController],
  providers: [LiveStreamingService],
})
export class LiveStreamingModule {}
