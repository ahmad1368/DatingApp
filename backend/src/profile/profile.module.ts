import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VoiceIntroController } from './voice-intro.controller';
import { VoiceIntroService } from './voice-intro.service';
import { GenderIdentityController } from './gender-identity.controller';
import { GenderIdentityService } from './gender-identity.service';

@Module({
  imports: [AuthModule],
  controllers: [VoiceIntroController, GenderIdentityController],
  providers: [VoiceIntroService, GenderIdentityService],
})
export class ProfileModule {}
