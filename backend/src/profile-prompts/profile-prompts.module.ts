import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TRANSCRIPTION_PROVIDER } from './interfaces/transcription-provider.interface';
import { OpenAiTranscriptionClient } from './providers/openai-transcription.client';
import { ProfilePromptsController } from './profile-prompts.controller';
import { ProfilePromptsService } from './profile-prompts.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfilePromptsController],
  providers: [
    ProfilePromptsService,
    {
      provide: TRANSCRIPTION_PROVIDER,
      useClass: OpenAiTranscriptionClient,
    },
  ],
})
export class ProfilePromptsModule {}
