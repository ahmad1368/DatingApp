import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfilePromptsController } from './profile-prompts.controller';
import { ProfilePromptsService } from './profile-prompts.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfilePromptsController],
  providers: [ProfilePromptsService],
})
export class ProfilePromptsModule {}
