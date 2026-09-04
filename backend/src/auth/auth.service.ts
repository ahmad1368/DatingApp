import { randomInt, createHash } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from './interfaces/sms-provider.interface';
import { GOOGLE_TOKEN_VERIFIER, GoogleTokenVerifier } from './interfaces/google-token-verifier.interface';
import { APPLE_TOKEN_VERIFIER, AppleTokenVerifier } from './interfaces/apple-token-verifier.interface';
import {
  DEBUG_OTP_CODE,
  DEBUG_TEST_PHONE_NUMBER,
  DEFAULT_OTP_CODE_LENGTH,
  DEFAULT_OTP_RESEND_COOLDOWN_SECONDS,
  DEFAULT_OTP_TTL_SECONDS,
  OTP_MAX_VERIFY_ATTEMPTS,
} from './auth.constants';

export interface RequestOtpResult {
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}

export interface VerifyOtpResult {
  accessToken: string;
  user: { id: string; phoneNumber: string };
}

export interface GoogleLoginResult {
  accessToken: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
}

export interface AppleLoginResult {
  accessToken: string;
  user: { id: string; email: string | null; name: string | null; isPrivateEmail: boolean };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(GOOGLE_TOKEN_VERIFIER) private readonly googleTokenVerifier: GoogleTokenVerifier,
    @Inject(APPLE_TOKEN_VERIFIER) private readonly appleTokenVerifier: AppleTokenVerifier,
  ) {}

  private get ttlSeconds(): number {
    return Number(this.configService.get('OTP_TTL_SECONDS') ?? DEFAULT_OTP_TTL_SECONDS);
  }

  private get resendCooldownSeconds(): number {
    return Number(
      this.configService.get('OTP_RESEND_COOLDOWN_SECONDS') ?? DEFAULT_OTP_RESEND_COOLDOWN_SECONDS,
    );
  }

  private get codeLength(): number {
    return Number(this.configService.get('OTP_CODE_LENGTH') ?? DEFAULT_OTP_CODE_LENGTH);
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** See DEBUG_TEST_PHONE_NUMBER's doc comment - opt-in local-dev only. */
  private get debugLoginEnabled(): boolean {
    return this.configService.get('AUTH_DEBUG_LOGIN_ENABLED') === 'true';
  }

  private generateCode(phoneNumber: string): string {
    if (this.debugLoginEnabled && phoneNumber === DEBUG_TEST_PHONE_NUMBER) {
      return DEBUG_OTP_CODE.padStart(this.codeLength, '0');
    }
    const max = 10 ** this.codeLength;
    return randomInt(0, max).toString().padStart(this.codeLength, '0');
  }

  async requestOtp(phoneNumber: string): Promise<RequestOtpResult> {
    const now = new Date();

    const lastOtp = await this.prisma.otpCode.findFirst({
      where: { phoneNumber, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (lastOtp) {
      const cooldownEndsAt = new Date(
        lastOtp.createdAt.getTime() + this.resendCooldownSeconds * 1000,
      );
      if (now < cooldownEndsAt) {
        const retryAfterSeconds = Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / 1000);
        throw new HttpException(
          {
            message: 'An OTP was already sent recently. Please wait before requesting a new one.',
            retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = this.generateCode(phoneNumber);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    await this.prisma.otpCode.create({
      data: {
        phoneNumber,
        codeHash: this.hashCode(code),
        expiresAt,
      },
    });

    await this.smsProvider.sendOtp(phoneNumber, code);

    return {
      expiresInSeconds: this.ttlSeconds,
      resendCooldownSeconds: this.resendCooldownSeconds,
    };
  }

  async verifyOtp(phoneNumber: string, code: string): Promise<VerifyOtpResult> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phoneNumber, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('No OTP was requested for this phone number.');
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    if (otp.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    if (otp.codeHash !== this.hashCode(code)) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP code.');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.upsert({
      where: { phoneNumber },
      create: { phoneNumber },
      update: {},
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      phoneNumber: user.phoneNumber,
    });

    return {
      accessToken,
      user: { id: user.id, phoneNumber: user.phoneNumber! },
    };
  }

  async loginWithGoogle(idToken: string): Promise<GoogleLoginResult> {
    const profile = await this.googleTokenVerifier.verify(idToken);

    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: profile.googleId,
            name: existingByEmail.name ?? profile.name,
            avatarUrl: existingByEmail.avatarUrl ?? profile.avatarUrl,
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            googleId: profile.googleId,
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
          },
        });
      }
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email!,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async loginWithApple(identityToken: string, fullName?: string): Promise<AppleLoginResult> {
    const profile = await this.appleTokenVerifier.verify(identityToken);

    let user = await this.prisma.user.findUnique({ where: { appleUserId: profile.appleUserId } });

    if (!user) {
      const existingByEmail = profile.email
        ? await this.prisma.user.findUnique({ where: { email: profile.email } })
        : null;

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            appleUserId: profile.appleUserId,
            name: existingByEmail.name ?? fullName,
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            appleUserId: profile.appleUserId,
            email: profile.email,
            name: fullName,
          },
        });
      }
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPrivateEmail: profile.isPrivateEmail,
      },
    };
  }
}
