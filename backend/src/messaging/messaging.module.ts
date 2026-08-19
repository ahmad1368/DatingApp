import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { GifSearchService } from './gif-search.service';
import { GIF_PROVIDER } from './interfaces/gif-provider.interface';
import { GiphyClient } from './providers/giphy.client';

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
  ],
})
export class MessagingModule {}
