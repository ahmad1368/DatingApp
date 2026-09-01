import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SafetyController } from './safety.controller';
import { SharedDatePlanController } from './shared-date-plan.controller';
import { SafetyService } from './safety.service';

@Module({
  imports: [AuthModule],
  controllers: [SafetyController, SharedDatePlanController],
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
