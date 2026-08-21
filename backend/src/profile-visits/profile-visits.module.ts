import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileVisitsController } from './profile-visits.controller';
import { ProfileVisitsService } from './profile-visits.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfileVisitsController],
  providers: [ProfileVisitsService],
})
export class ProfileVisitsModule {}
