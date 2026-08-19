import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VoiceIntroController } from './voice-intro.controller';
import { VoiceIntroService } from './voice-intro.service';

@Module({
  imports: [AuthModule],
  controllers: [VoiceIntroController],
  providers: [VoiceIntroService],
})
export class ProfileModule {}
