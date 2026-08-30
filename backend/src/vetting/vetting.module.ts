import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VettingController } from './vetting.controller';
import { VettingService } from './vetting.service';
import { VipReferralController } from './vip-referral.controller';
import { VipReferralService } from './vip-referral.service';

@Module({
  imports: [AuthModule],
  controllers: [VettingController, VipReferralController],
  providers: [VettingService, VipReferralService],
})
export class VettingModule {}
