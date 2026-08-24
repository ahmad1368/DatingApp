import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SafetyModule } from '../safety/safety.module';
import { CONTENT_MODERATOR } from '../messaging/interfaces/content-moderator.interface';
import { OpenAiContentModerator } from '../messaging/providers/openai-content-moderator.client';
import { CallingController } from './calling.controller';
import { CallingService } from './calling.service';

@Module({
  imports: [AuthModule, SafetyModule],
  controllers: [CallingController],
  providers: [
    CallingService,
    {
      provide: CONTENT_MODERATOR,
      useClass: OpenAiContentModerator,
    },
  ],
})
export class CallingModule {}
