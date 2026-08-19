import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { VoiceIntroController } from './voice-intro.controller';
import { VoiceIntroService } from './voice-intro.service';
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

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [
    VoiceIntroController,
    GenderIdentityController,
    ProfileItemLikeController,
    RelationshipProfileController,
    LifestyleFiltersController,
    InstagramController,
  ],
  providers: [
    VoiceIntroService,
    GenderIdentityService,
    ProfileItemLikeService,
    RelationshipProfileService,
    LifestyleFiltersService,
    InstagramSyncService,
    {
      provide: INSTAGRAM_CLIENT,
      useClass: InstagramGraphApiClient,
    },
  ],
})
export class ProfileModule {}
