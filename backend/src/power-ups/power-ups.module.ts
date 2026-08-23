import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PowerUpsController } from './power-ups.controller';
import { PowerUpsService } from './power-ups.service';

@Module({
  imports: [AuthModule],
  controllers: [PowerUpsController],
  providers: [PowerUpsService],
})
export class PowerUpsModule {}
