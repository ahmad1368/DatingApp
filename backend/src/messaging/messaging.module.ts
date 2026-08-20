import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { GifSearchService } from './gif-search.service';
import { GIF_PROVIDER } from './interfaces/gif-provider.interface';
import { GiphyClient } from './providers/giphy.client';
import { MessageModerationService } from './message-moderation.service';
import { CONTENT_MODERATOR } from './interfaces/content-moderator.interface';
import { OpenAiContentModerator } from './providers/openai-content-moderator.client';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    GifSearchService,
    {
      provide: GIF_PROVIDER,
      useClass: GiphyClient,
    },
    MessageModerationService,
    {
      provide: CONTENT_MODERATOR,
      useClass: OpenAiContentModerator,
    },
  ],
})
export class MessagingModule {}
