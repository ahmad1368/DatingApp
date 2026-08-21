import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google-auth.controller';
import { AppleAuthController } from './apple-auth.controller';
import { AuthService } from './auth.service';
import { SMS_PROVIDER } from './interfaces/sms-provider.interface';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { GOOGLE_TOKEN_VERIFIER } from './interfaces/google-token-verifier.interface';
import { GoogleOAuthTokenVerifier } from './providers/google-oauth-token-verifier.provider';
import { APPLE_TOKEN_VERIFIER } from './interfaces/apple-token-verifier.interface';
import { AppleSigninTokenVerifier } from './providers/apple-signin-token-verifier.provider';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  controllers: [AuthController, GoogleAuthController, AppleAuthController],
  providers: [
    AuthService,
    {
      provide: SMS_PROVIDER,
      useClass: ConsoleSmsProvider,
    },
    {
      provide: GOOGLE_TOKEN_VERIFIER,
      useClass: GoogleOAuthTokenVerifier,
    },
    {
      provide: APPLE_TOKEN_VERIFIER,
      useClass: AppleSigninTokenVerifier,
    },
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, SMS_PROVIDER],
})
export class AuthModule {}
