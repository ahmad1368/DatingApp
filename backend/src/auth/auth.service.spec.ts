import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from './interfaces/sms-provider.interface';
import { GoogleTokenVerifier } from './interfaces/google-token-verifier.interface';
import { AppleTokenVerifier } from './interfaces/apple-token-verifier.interface';
import { DEBUG_OTP_CODE, DEBUG_TEST_PHONE_NUMBER } from './auth.constants';

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
    user: { upsert: jest.Mock; findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
  };
  let jwtService: { signAsync: jest.Mock };
  let smsProvider: SmsProvider;
  let googleTokenVerifier: GoogleTokenVerifier;
  let appleTokenVerifier: AppleTokenVerifier;

  function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
    const values: Record<string, string> = {
      OTP_TTL_SECONDS: '300',
      OTP_RESEND_COOLDOWN_SECONDS: '60',
      OTP_CODE_LENGTH: '6',
      ...overrides,
    };
    return { get: (key: string) => values[key] } as unknown as ConfigService;
  }

  beforeEach(() => {
    prisma = {
      otpCode: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    smsProvider = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
    googleTokenVerifier = { verify: jest.fn() };
    appleTokenVerifier = { verify: jest.fn() };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      buildConfigService(),
      smsProvider,
      googleTokenVerifier,
      appleTokenVerifier,
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

    it('issues the fixed debug OTP for the debug test number when the flag is enabled', async () => {
      const debugService = new AuthService(
        prisma as unknown as PrismaService,
        jwtService as unknown as JwtService,
        buildConfigService({ AUTH_DEBUG_LOGIN_ENABLED: 'true' }),
        smsProvider,
        googleTokenVerifier,
        appleTokenVerifier,
      );
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.create.mockResolvedValue({});

      await debugService.requestOtp(DEBUG_TEST_PHONE_NUMBER);

      expect(smsProvider.sendOtp).toHaveBeenCalledWith(DEBUG_TEST_PHONE_NUMBER, DEBUG_OTP_CODE);
    });

    it('still issues a random OTP for the debug test number when the flag is disabled', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.create.mockResolvedValue({});

      await service.requestOtp(DEBUG_TEST_PHONE_NUMBER);

      expect(smsProvider.sendOtp).toHaveBeenCalledWith(
        DEBUG_TEST_PHONE_NUMBER,
        expect.not.stringMatching(`^${DEBUG_OTP_CODE}$`),
      );
    });

    it('still issues a random OTP for any other number even when the flag is enabled', async () => {
      const debugService = new AuthService(
        prisma as unknown as PrismaService,
        jwtService as unknown as JwtService,
        buildConfigService({ AUTH_DEBUG_LOGIN_ENABLED: 'true' }),
        smsProvider,
        googleTokenVerifier,
        appleTokenVerifier,
      );
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.create.mockResolvedValue({});

      await debugService.requestOtp(PHONE);

      expect(smsProvider.sendOtp).toHaveBeenCalledWith(
        PHONE,
        expect.not.stringMatching(`^${DEBUG_OTP_CODE}$`),
      );
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

  describe('loginWithGoogle', () => {
    const PROFILE = {
      googleId: 'google-123',
      email: 'jane@example.com',
      name: 'Jane Doe',
      avatarUrl: 'https://example.com/avatar.png',
    };

    it('creates a new user when no existing account matches', async () => {
      (googleTokenVerifier.verify as jest.Mock).mockResolvedValue(PROFILE);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', ...PROFILE });

      const result = await service.loginWithGoogle('id-token');

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          googleId: PROFILE.googleId,
          email: PROFILE.email,
          name: PROFILE.name,
          avatarUrl: PROFILE.avatarUrl,
        },
      });
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        user: {
          id: 'user-1',
          email: PROFILE.email,
          name: PROFILE.name,
          avatarUrl: PROFILE.avatarUrl,
        },
      });
    });

    it('links the Google account to an existing user found by email', async () => {
      (googleTokenVerifier.verify as jest.Mock).mockResolvedValue(PROFILE);
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // lookup by googleId
        .mockResolvedValueOnce({ id: 'user-1', email: PROFILE.email, name: null, avatarUrl: null }); // lookup by email
      prisma.user.update.mockResolvedValue({ id: 'user-1', ...PROFILE });

      await service.loginWithGoogle('id-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          googleId: PROFILE.googleId,
          name: PROFILE.name,
          avatarUrl: PROFILE.avatarUrl,
        },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('reuses the existing account when found directly by googleId', async () => {
      (googleTokenVerifier.verify as jest.Mock).mockResolvedValue(PROFILE);
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', ...PROFILE });

      const result = await service.loginWithGoogle('id-token');

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-1');
    });
  });

  describe('loginWithApple', () => {
    const PROFILE = {
      appleUserId: 'apple-123',
      email: 'jane@privaterelay.appleid.com',
      isPrivateEmail: true,
    };

    it('creates a new user when no existing account matches', async () => {
      (appleTokenVerifier.verify as jest.Mock).mockResolvedValue(PROFILE);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: PROFILE.email,
        name: 'Jane Doe',
      });

      const result = await service.loginWithApple('identity-token', 'Jane Doe');

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          appleUserId: PROFILE.appleUserId,
          email: PROFILE.email,
          name: 'Jane Doe',
        },
      });
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        user: {
          id: 'user-1',
          email: PROFILE.email,
          name: 'Jane Doe',
          isPrivateEmail: true,
        },
      });
    });

    it('links the Apple account to an existing user found by email', async () => {
      (appleTokenVerifier.verify as jest.Mock).mockResolvedValue(PROFILE);
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // lookup by appleUserId
        .mockResolvedValueOnce({ id: 'user-1', email: PROFILE.email, name: null }); // lookup by email
      prisma.user.update.mockResolvedValue({ id: 'user-1', email: PROFILE.email, name: null });

      await service.loginWithApple('identity-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          appleUserId: PROFILE.appleUserId,
          name: undefined,
        },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('reuses the existing account when found directly by appleUserId', async () => {
      (appleTokenVerifier.verify as jest.Mock).mockResolvedValue(PROFILE);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: PROFILE.email,
        name: 'Jane Doe',
      });

      const result = await service.loginWithApple('identity-token');

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-1');
    });
  });
});
