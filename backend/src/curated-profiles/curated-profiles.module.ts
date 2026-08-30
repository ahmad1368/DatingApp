import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchingModule } from '../matching/matching.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CuratedProfilesController } from './curated-profiles.controller';
import { CuratedProfilesService } from './curated-profiles.service';

@Module({
  imports: [AuthModule, MatchingModule, NotificationsModule],
  controllers: [CuratedProfilesController],
  providers: [CuratedProfilesService],
})
export class CuratedProfilesModule {}
