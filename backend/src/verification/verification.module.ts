import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { FACE_MATCH_PROVIDER } from './interfaces/face-match-provider.interface';
import { MockFaceMatchProvider } from './providers/mock-face-match.provider';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    {
      provide: FACE_MATCH_PROVIDER,
      useClass: MockFaceMatchProvider,
    },
  ],
})
export class VerificationModule {}
