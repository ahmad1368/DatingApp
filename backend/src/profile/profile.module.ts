import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { VoiceIntroController } from './voice-intro.controller';
import { VoiceIntroService } from './voice-intro.service';
import { VideoSnippetController } from './video-snippet.controller';
import { VideoSnippetService } from './video-snippet.service';
import { GenderIdentityController } from './gender-identity.controller';
import { GenderIdentityService } from './gender-identity.service';
import { ProfileItemLikeController } from './profile-item-like.controller';
import { ProfileItemLikeService } from './profile-item-like.service';
import { RelationshipProfileController } from './relationship-profile.controller';
import { RelationshipProfileService } from './relationship-profile.service';
import { LifestyleFiltersController } from './lifestyle-filters.controller';
import { LifestyleFiltersService } from './lifestyle-filters.service';
import { InstagramController } from './instagram.controller';
import { InstagramSyncService } from './instagram-sync.service';
import { INSTAGRAM_CLIENT } from './interfaces/instagram-client.interface';
import { InstagramGraphApiClient } from './providers/instagram-graph-api.client';
import { SpotifyController } from './spotify.controller';
import { SpotifySyncService } from './spotify-sync.service';
import { SPOTIFY_CLIENT } from './interfaces/spotify-client.interface';
import { SpotifyWebApiClient } from './providers/spotify-web-api.client';
import { ZodiacController } from './zodiac.controller';
import { ZodiacService } from './zodiac.service';
import { LoveStyleController } from './love-style.controller';
import { LoveStyleService } from './love-style.service';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { BioWriterController } from './bio-writer.controller';
import { BioWriterService } from './bio-writer.service';
import { BIO_WRITER_PROVIDER } from './interfaces/bio-writer-provider.interface';
import { OpenAiBioWriterClient } from './providers/openai-bio-writer.client';
import { ProfilePollController } from './profile-poll.controller';
import { ProfilePollService } from './profile-poll.service';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [
    VoiceIntroController,
    VideoSnippetController,
    GenderIdentityController,
    ProfileItemLikeController,
    RelationshipProfileController,
    LifestyleFiltersController,
    InstagramController,
    SpotifyController,
    ZodiacController,
    LoveStyleController,
    AvatarController,
    BioWriterController,
    ProfilePollController,
  ],
  providers: [
    VoiceIntroService,
    VideoSnippetService,
    GenderIdentityService,
    ProfileItemLikeService,
    RelationshipProfileService,
    LifestyleFiltersService,
    InstagramSyncService,
    {
      provide: INSTAGRAM_CLIENT,
      useClass: InstagramGraphApiClient,
    },
    SpotifySyncService,
    {
      provide: SPOTIFY_CLIENT,
      useClass: SpotifyWebApiClient,
    },
    ZodiacService,
    LoveStyleService,
    AvatarService,
    BioWriterService,
    {
      provide: BIO_WRITER_PROVIDER,
      useClass: OpenAiBioWriterClient,
    },
    ProfilePollService,
  ],
})
export class ProfileModule {}
