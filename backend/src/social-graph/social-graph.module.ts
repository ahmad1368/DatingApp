import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SocialGraphController } from './social-graph.controller';
import { SocialGraphService } from './social-graph.service';

@Module({
  imports: [AuthModule],
  controllers: [SocialGraphController],
  providers: [SocialGraphService],
})
export class SocialGraphModule {}
