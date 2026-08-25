import { createHash } from 'crypto';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailProvider } from './interfaces/email-provider.interface';
import { WorkVerificationService } from './work-verification.service';

const USER_ID = 'user-1';
const EMAIL = 'ahmad@example-corp.com';

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

describe('WorkVerificationService', () => {
  let service: WorkVerificationService;
  let prisma: {
    credentialVerificationCode: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    user: { update: jest.Mock; findUnique: jest.Mock };
  };
  let emailProvider: EmailProvider;

  beforeEach(() => {
    prisma = {
      credentialVerificationCode: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      user: { update: jest.fn(), findUnique: jest.fn() },
    };
    emailProvider = { sendVerificationCode: jest.fn() };
    service = new WorkVerificationService(prisma as unknown as PrismaService, emailProvider);
  });

  describe('requestVerification', () => {
    it('claims the job title/company, resets isWorkVerified, and sends a code', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue(null);
      prisma.credentialVerificationCode.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      const result = await service.requestVerification(
        USER_ID,
        'WORK',
        EMAIL,
        'Engineer',
        'Example Corp',
      );

      expect(prisma.credentialVerificationCode.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          email: EMAIL,
          type: 'WORK',
          codeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { jobTitle: 'Engineer', company: 'Example Corp', isWorkVerified: false },
      });
      expect(emailProvider.sendVerificationCode).toHaveBeenCalledWith(
        EMAIL,
        expect.stringMatching(/^\d{6}$/),
      );
      expect(result).toEqual({ expiresInSeconds: 600, resendCooldownSeconds: 60 });
    });

    it('claims the school and resets isEducationVerified for an EDUCATION request', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue(null);
      prisma.credentialVerificationCode.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      await service.requestVerification(USER_ID, 'EDUCATION', EMAIL, undefined, undefined, 'MIT');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { school: 'MIT', isEducationVerified: false },
      });
    });

    it('throws 429 when a resend is requested within the cooldown window', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(service.requestVerification(USER_ID, 'WORK', EMAIL)).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(prisma.credentialVerificationCode.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmVerification', () => {
    it('throws when no code was requested', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue(null);

      await expect(service.confirmVerification(USER_ID, '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the code has expired', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue({
        id: 'code-1',
        type: 'WORK',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
      });

      await expect(service.confirmVerification(USER_ID, '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws after too many failed attempts', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue({
        id: 'code-1',
        type: 'WORK',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 5,
      });

      await expect(service.confirmVerification(USER_ID, '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('increments attempts and throws on an incorrect code', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue({
        id: 'code-1',
        type: 'WORK',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      prisma.credentialVerificationCode.update.mockResolvedValue({});

      await expect(service.confirmVerification(USER_ID, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.credentialVerificationCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('consumes the code and sets isWorkVerified on success', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue({
        id: 'code-1',
        type: 'WORK',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      prisma.credentialVerificationCode.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({
        jobTitle: 'Engineer',
        company: 'Example Corp',
        school: null,
        isWorkVerified: true,
        isEducationVerified: false,
      });

      const result = await service.confirmVerification(USER_ID, '123456');

      expect(prisma.credentialVerificationCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { isWorkVerified: true },
      });
      expect(result).toEqual({
        jobTitle: 'Engineer',
        company: 'Example Corp',
        school: null,
        isWorkVerified: true,
        isEducationVerified: false,
      });
    });

    it('sets isEducationVerified on success for an EDUCATION code', async () => {
      prisma.credentialVerificationCode.findFirst.mockResolvedValue({
        id: 'code-1',
        type: 'EDUCATION',
        codeHash: hash('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      prisma.credentialVerificationCode.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({
        jobTitle: null,
        company: null,
        school: 'MIT',
        isWorkVerified: false,
        isEducationVerified: true,
      });

      await service.confirmVerification(USER_ID, '123456');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { isEducationVerified: true },
      });
    });
  });

  describe('getStatus', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getStatus(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the current credential status', async () => {
      prisma.user.findUnique.mockResolvedValue({
        jobTitle: 'Engineer',
        company: 'Example Corp',
        school: null,
        isWorkVerified: true,
        isEducationVerified: false,
      });

      const result = await service.getStatus(USER_ID);

      expect(result).toEqual({
        jobTitle: 'Engineer',
        company: 'Example Corp',
        school: null,
        isWorkVerified: true,
        isEducationVerified: false,
      });
    });
  });
});
