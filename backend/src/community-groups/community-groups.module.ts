import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunityGroupsController } from './community-groups.controller';
import { CommunityGroupsService } from './community-groups.service';

@Module({
  imports: [AuthModule],
  controllers: [CommunityGroupsController],
  providers: [CommunityGroupsService],
  exports: [CommunityGroupsService],
})
export class CommunityGroupsModule {}
