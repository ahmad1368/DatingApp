import { randomBytes } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REFERRAL_CODE_LENGTH, REQUIRED_PEER_REFERRALS } from './vetting.constants';

export interface ApplicationView {
  id: string;
  userId: string;
  status: string;
  referralCount: number;
  socialLinks: string[];
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface QueuedApplicationView {
  id: string;
  referralCount: number;
  socialLinks: string[];
  createdAt: string;
}

interface ApplicationRecord {
  id: string;
  userId: string;
  status: string;
  referralCount: number;
  socialLinks: string[];
  decisionReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

@Injectable()
export class VettingService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(userId: string, socialLinks: string[] = []): Promise<ApplicationView> {
    const existing = await this.prisma.application.findUnique({ where: { userId } });
    if (existing) {
      throw new BadRequestException('You have already applied.');
    }

    const application = await this.prisma.application.create({ data: { userId, socialLinks } });
    return this.toView(application);
  }

  async getMyApplication(userId: string): Promise<ApplicationView> {
    const application = await this.prisma.application.findUnique({ where: { userId } });
    if (!application) {
      throw new NotFoundException("You haven't applied yet.");
    }
    return this.toView(application);
  }

  /** A member who already knows the applicant's userId refers them directly. */
  async refer(referrerUserId: string, applicantUserId: string): Promise<ApplicationView> {
    return this.createReferral(referrerUserId, applicantUserId);
  }

  /**
   * The applicant-initiated counterpart to [refer]: redeems a code an
   * existing member shared with them (see [getMyReferralCode]) instead of
   * requiring the member to look up the applicant's userId themselves.
   */
  async redeemReferralCode(applicantUserId: string, code: string): Promise<ApplicationView> {
    const referrer = await this.prisma.user.findUnique({ where: { referralCode: code } });
    if (!referrer) {
      throw new NotFoundException('Invalid referral code.');
    }

    return this.createReferral(referrer.id, applicantUserId);
  }

  /** Generates (once) and returns the caller's shareable referral code - only approved members have one. */
  async getMyReferralCode(userId: string): Promise<{ referralCode: string }> {
    const application = await this.prisma.application.findUnique({ where: { userId } });
    if (!application || application.status !== 'APPROVED') {
      throw new ForbiddenException('Only approved members can generate a referral code.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (user?.referralCode) {
      return { referralCode: user.referralCode };
    }

    const referralCode = this.generateReferralCode();
    await this.prisma.user.update({ where: { id: userId }, data: { referralCode } });
    return { referralCode };
  }

  private async createReferral(referrerUserId: string, applicantUserId: string): Promise<ApplicationView> {
    if (referrerUserId === applicantUserId) {
      throw new BadRequestException('You cannot refer yourself.');
    }

    const referrerApplication = await this.prisma.application.findUnique({
      where: { userId: referrerUserId },
    });
    if (!referrerApplication || referrerApplication.status !== 'APPROVED') {
      throw new ForbiddenException('Only approved members can refer new applicants.');
    }

    const applicantApplication = await this.prisma.application.findUnique({
      where: { userId: applicantUserId },
    });
    if (!applicantApplication) {
      throw new NotFoundException('Application not found.');
    }
    if (applicantApplication.status !== 'PENDING') {
      throw new BadRequestException('This application is no longer pending.');
    }

    const existingReferral = await this.prisma.referral.findUnique({
      where: {
        applicationId_referrerUserId: {
          applicationId: applicantApplication.id,
          referrerUserId,
        },
      },
    });
    if (existingReferral) {
      throw new BadRequestException('You have already referred this applicant.');
    }

    await this.prisma.referral.create({
      data: { applicationId: applicantApplication.id, referrerUserId },
    });

    const updated = await this.prisma.application.update({
      where: { id: applicantApplication.id },
      data: { referralCount: { increment: 1 } },
    });

    return this.toView(updated);
  }

  private generateReferralCode(): string {
    return randomBytes(REFERRAL_CODE_LENGTH / 2)
      .toString('hex')
      .toUpperCase();
  }

  async listQueue(committeeUserId: string): Promise<QueuedApplicationView[]> {
    await this.requireCommitteeMember(committeeUserId);

    const applications = await this.prisma.application.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ referralCount: 'desc' }, { createdAt: 'asc' }],
    });

    return applications.map((application) => ({
      id: application.id,
      referralCount: application.referralCount,
      socialLinks: application.socialLinks,
      createdAt: application.createdAt.toISOString(),
    }));
  }

  async decide(
    committeeUserId: string,
    applicationId: string,
    decision: string,
    reason?: string,
  ): Promise<ApplicationView> {
    await this.requireCommitteeMember(committeeUserId);

    const application = await this.prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) {
      throw new NotFoundException('Application not found.');
    }
    if (application.status !== 'PENDING') {
      throw new BadRequestException('This application has already been decided.');
    }
    if (decision === 'APPROVED' && application.referralCount < REQUIRED_PEER_REFERRALS) {
      throw new BadRequestException(
        `This application needs at least ${REQUIRED_PEER_REFERRALS} peer referrals before it can be approved.`,
      );
    }

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: decision,
        decidedByUserId: committeeUserId,
        decisionReason: reason ?? null,
        decidedAt: new Date(),
      },
    });

    return this.toView(updated);
  }

  private async requireCommitteeMember(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isCommitteeMember: true },
    });
    if (!user?.isCommitteeMember) {
      throw new ForbiddenException('Only committee members can perform this action.');
    }
  }

  private toView(application: ApplicationRecord): ApplicationView {
    return {
      id: application.id,
      userId: application.userId,
      status: application.status,
      referralCount: application.referralCount,
      socialLinks: application.socialLinks,
      decisionReason: application.decisionReason,
      createdAt: application.createdAt.toISOString(),
      decidedAt: application.decidedAt ? application.decidedAt.toISOString() : null,
    };
  }
}
