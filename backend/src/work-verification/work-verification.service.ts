import { randomInt, createHash } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER, EmailProvider } from './interfaces/email-provider.interface';
import {
  CREDENTIAL_CODE_LENGTH,
  CREDENTIAL_CODE_TTL_SECONDS,
  CREDENTIAL_MAX_VERIFY_ATTEMPTS,
  CREDENTIAL_RESEND_COOLDOWN_SECONDS,
  CredentialType,
} from './work-verification.constants';

export interface RequestCredentialVerificationResult {
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}

export interface CredentialVerificationStatus {
  jobTitle: string | null;
  company: string | null;
  school: string | null;
  isWorkVerified: boolean;
  isEducationVerified: boolean;
}

/**
 * "Dynamic work & education verification": a user claims a job title/
 * company or a school, then proves they control an email address for it
 * by confirming a one-time code - the same pattern as AuthService's phone
 * OTP flow, just for a claimed credential's email instead of login.
 */
@Injectable()
export class WorkVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateCode(): string {
    const max = 10 ** CREDENTIAL_CODE_LENGTH;
    return randomInt(0, max).toString().padStart(CREDENTIAL_CODE_LENGTH, '0');
  }

  /**
   * Claims the job title/company (or school) immediately, so it shows on
   * the profile right away like any other field, and resets that
   * credential's verified flag - it only flips back to true once
   * [confirmVerification] succeeds for the code just sent.
   */
  async requestVerification(
    userId: string,
    type: CredentialType,
    email: string,
    jobTitle?: string,
    company?: string,
    school?: string,
  ): Promise<RequestCredentialVerificationResult> {
    const now = new Date();

    const lastCode = await this.prisma.credentialVerificationCode.findFirst({
      where: { userId, type, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (lastCode) {
      const cooldownEndsAt = new Date(
        lastCode.createdAt.getTime() + CREDENTIAL_RESEND_COOLDOWN_SECONDS * 1000,
      );
      if (now < cooldownEndsAt) {
        const retryAfterSeconds = Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / 1000);
        throw new HttpException(
          {
            message:
              'A verification code was already sent recently. Please wait before requesting a new one.',
            retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = this.generateCode();
    const expiresAt = new Date(now.getTime() + CREDENTIAL_CODE_TTL_SECONDS * 1000);

    await this.prisma.credentialVerificationCode.create({
      data: { userId, email, type, codeHash: this.hashCode(code), expiresAt },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data:
        type === 'WORK'
          ? { jobTitle: jobTitle ?? null, company: company ?? null, isWorkVerified: false }
          : { school: school ?? null, isEducationVerified: false },
    });

    await this.emailProvider.sendVerificationCode(email, code);

    return {
      expiresInSeconds: CREDENTIAL_CODE_TTL_SECONDS,
      resendCooldownSeconds: CREDENTIAL_RESEND_COOLDOWN_SECONDS,
    };
  }

  async confirmVerification(userId: string, code: string): Promise<CredentialVerificationStatus> {
    const pending = await this.prisma.credentialVerificationCode.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) {
      throw new BadRequestException('No verification code was requested.');
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    if (pending.attempts >= CREDENTIAL_MAX_VERIFY_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts. Please request a new code.');
    }

    if (pending.codeHash !== this.hashCode(code)) {
      await this.prisma.credentialVerificationCode.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid verification code.');
    }

    await this.prisma.credentialVerificationCode.update({
      where: { id: pending.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: pending.type === 'WORK' ? { isWorkVerified: true } : { isEducationVerified: true },
    });

    return this.toStatus(user);
  }

  async getStatus(userId: string): Promise<CredentialVerificationStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.toStatus(user);
  }

  private toStatus(user: {
    jobTitle: string | null;
    company: string | null;
    school: string | null;
    isWorkVerified: boolean;
    isEducationVerified: boolean;
  }): CredentialVerificationStatus {
    return {
      jobTitle: user.jobTitle,
      company: user.company,
      school: user.school,
      isWorkVerified: user.isWorkVerified,
      isEducationVerified: user.isEducationVerified,
    };
  }
}
