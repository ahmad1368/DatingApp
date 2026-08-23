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
import { BlindDatingModule } from './blind-dating/blind-dating.module';
import { LiveStreamingModule } from './live-streaming/live-streaming.module';
import { DateSuggestionsModule } from './date-suggestions/date-suggestions.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ProfileVisitsModule } from './profile-visits/profile-visits.module';
import { VaultModule } from './vault/vault.module';
import { EventsModule } from './events/events.module';
import { ProfilePhotosModule } from './profile-photos/profile-photos.module';
import { RelationshipCoachModule } from './relationship-coach/relationship-coach.module';
import { ScreenSecurityModule } from './screen-security/screen-security.module';
import { WalletModule } from './wallet/wallet.module';

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
    BlindDatingModule,
    LiveStreamingModule,
    DateSuggestionsModule,
    SubscriptionsModule,
    ProfileVisitsModule,
    VaultModule,
    EventsModule,
    ProfilePhotosModule,
    RelationshipCoachModule,
    ScreenSecurityModule,
    WalletModule,
  ],
})
export class AppModule {}
