import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VoiceIntroController } from './voice-intro.controller';
import { VoiceIntroService } from './voice-intro.service';
import { GenderIdentityController } from './gender-identity.controller';
import { GenderIdentityService } from './gender-identity.service';
import { ProfileItemLikeController } from './profile-item-like.controller';
import { ProfileItemLikeService } from './profile-item-like.service';

@Module({
  imports: [AuthModule],
  controllers: [VoiceIntroController, GenderIdentityController, ProfileItemLikeController],
  providers: [VoiceIntroService, GenderIdentityService, ProfileItemLikeService],
})
export class ProfileModule {}
