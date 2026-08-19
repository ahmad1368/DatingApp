import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VettingController } from './vetting.controller';
import { VettingService } from './vetting.service';

@Module({
  imports: [AuthModule],
  controllers: [VettingController],
  providers: [VettingService],
})
export class VettingModule {}
