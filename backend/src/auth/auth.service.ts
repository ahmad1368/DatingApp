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
import {
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
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

  private generateCode(): string {
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

    const code = this.generateCode();
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
      user: { id: user.id, phoneNumber: user.phoneNumber },
    };
  }
}
