import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VoiceIntroController } from './voice-intro.controller';
import { VoiceIntroService } from './voice-intro.service';
import { GenderIdentityController } from './gender-identity.controller';
import { GenderIdentityService } from './gender-identity.service';
import { ProfileItemLikeController } from './profile-item-like.controller';
import { ProfileItemLikeService } from './profile-item-like.service';
import { RelationshipProfileController } from './relationship-profile.controller';
import { RelationshipProfileService } from './relationship-profile.service';

@Module({
  imports: [AuthModule],
  controllers: [
    VoiceIntroController,
    GenderIdentityController,
    ProfileItemLikeController,
    RelationshipProfileController,
  ],
  providers: [
    VoiceIntroService,
    GenderIdentityService,
    ProfileItemLikeService,
    RelationshipProfileService,
  ],
})
export class ProfileModule {}
