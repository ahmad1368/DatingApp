import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TRANSLATION_PROVIDER } from '../messaging/interfaces/translation-provider.interface';
import { OpenAiTranslationClient } from '../messaging/providers/openai-translation.client';
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
    {
      provide: TRANSLATION_PROVIDER,
      useClass: OpenAiTranslationClient,
    },
  ],
})
export class ProfilePromptsModule {}
