import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { VerificationModule } from './verification/verification.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LocationModule } from './location/location.module';
import { ProfileModule } from './profile/profile.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { MessagingModule } from './messaging/messaging.module';
import { MatchingModule } from './matching/matching.module';
import { CuratedProfilesModule } from './curated-profiles/curated-profiles.module';
import { VettingModule } from './vetting/vetting.module';
import { CouplesModule } from './couples/couples.module';
import { PersonalityModule } from './personality/personality.module';
import { CallingModule } from './calling/calling.module';
import { SafetyModule } from './safety/safety.module';
import { BlockingModule } from './blocking/blocking.module';
import { GiftingModule } from './gifting/gifting.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    VerificationModule,
    OnboardingModule,
    LocationModule,
    ProfileModule,
    DiscoveryModule,
    MessagingModule,
    MatchingModule,
    CuratedProfilesModule,
    VettingModule,
    CouplesModule,
    PersonalityModule,
    CallingModule,
    SafetyModule,
    BlockingModule,
    GiftingModule,
  ],
})
export class AppModule {}
