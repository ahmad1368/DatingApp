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
  ],
})
export class ProfileModule {}
