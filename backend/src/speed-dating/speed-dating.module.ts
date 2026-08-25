import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SpeedDatingController } from './speed-dating.controller';
import { SpeedDatingService } from './speed-dating.service';

@Module({
  imports: [AuthModule],
  controllers: [SpeedDatingController],
  providers: [SpeedDatingService],
})
export class SpeedDatingModule {}
