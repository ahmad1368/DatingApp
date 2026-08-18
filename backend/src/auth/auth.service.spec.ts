import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from './interfaces/sms-provider.interface';

const PHONE = '+14155552671';

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { upsert: jest.Mock };
  };
  let jwtService: { signAsync: jest.Mock };
  let smsProvider: SmsProvider;

  beforeEach(() => {
    prisma = {
      otpCode: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: { upsert: jest.fn() },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    smsProvider = { sendOtp: jest.fn().mockResolvedValue(undefined) };

    const configService = {
      get: (key: string) => {
        const values: Record<string, string> = {
          OTP_TTL_SECONDS: '300',
          OTP_RESEND_COOLDOWN_SECONDS: '60',
          OTP_CODE_LENGTH: '6',
        };
        return values[key];
      },
    } as unknown as ConfigService;

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService,
      smsProvider,
    );
  });

  describe('requestOtp', () => {
    it('creates an OTP and sends it when no recent OTP exists', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.create.mockResolvedValue({});

      const result = await service.requestOtp(PHONE);

      expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
      expect(smsProvider.sendOtp).toHaveBeenCalledWith(PHONE, expect.stringMatching(/^\d{6}$/));
      expect(result).toEqual({ expiresInSeconds: 300, resendCooldownSeconds: 60 });
    });

    it('throws 429 when a resend is requested within the cooldown window', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        createdAt: new Date(),
      });

      await expect(service.requestOtp(PHONE)).rejects.toBeInstanceOf(HttpException);
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('throws when no OTP was requested', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);

      await expect(service.verifyOtp(PHONE, '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the OTP has expired', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
      });

      await expect(service.verifyOtp(PHONE, '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('increments attempts and throws on an incorrect code', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      prisma.otpCode.update.mockResolvedValue({});

      await expect(service.verifyOtp(PHONE, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('consumes the OTP and returns an access token on success', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      prisma.otpCode.update.mockResolvedValue({});
      prisma.user.upsert.mockResolvedValue({ id: 'user-1', phoneNumber: PHONE });

      const result = await service.verifyOtp(PHONE, '123456');

      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { phoneNumber: PHONE },
        create: { phoneNumber: PHONE },
        update: {},
      });
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        user: { id: 'user-1', phoneNumber: PHONE },
      });
    });
  });
});
