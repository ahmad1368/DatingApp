import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GiftingController } from './gifting.controller';
import { GiftingService } from './gifting.service';

@Module({
  imports: [AuthModule],
  controllers: [GiftingController],
  providers: [GiftingService],
  exports: [GiftingService],
})
export class GiftingModule {}
