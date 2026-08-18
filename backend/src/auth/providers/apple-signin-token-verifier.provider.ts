import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyIdToken } from 'apple-signin-auth';
import { AppleProfile, AppleTokenVerifier } from '../interfaces/apple-token-verifier.interface';

@Injectable()
export class AppleSigninTokenVerifier implements AppleTokenVerifier {
  constructor(private readonly configService: ConfigService) {}

  async verify(identityToken: string): Promise<AppleProfile> {
    const audience = this.configService.get<string>('APPLE_CLIENT_ID');

    let payload;
    try {
      payload = await verifyIdToken(identityToken, { audience });
    } catch {
      throw new UnauthorizedException('Unable to verify Apple ID token.');
    }

    return {
      appleUserId: payload.sub,
      email: payload.email ?? null,
      isPrivateEmail: payload.is_private_email === true || payload.is_private_email === 'true',
    };
  }
}
