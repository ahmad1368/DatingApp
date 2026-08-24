import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileCompletionController } from './profile-completion.controller';
import { ProfileCompletionService } from './profile-completion.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfileCompletionController],
  providers: [ProfileCompletionService],
})
export class ProfileCompletionModule {}
